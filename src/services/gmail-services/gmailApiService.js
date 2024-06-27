import { google } from "googleapis";
import fs from "fs";
import { categorizeEmail, generateResponseEmail } from "../ai-services/aiServices.js"
import cheerio from 'cheerio';
import util from 'util';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { auth } from '../../../server.js'
import { setTimeout as setTimeoutPromise } from 'timers/promises';
import colours from '@colors/colors';


// Initialize Redis connection
export const connection = new IORedis({
    maxRetriesPerRequest: null,
    enableReadyCheck: false
});

// Define the queue for processing emails
const emailQueue = new Queue('emailProcessingQueue', { connection });

async function sendEmail(auth, to, subject, body) {
    if (to === "" || subject === "" || body === "") {
        console.log("Email not sent. Missing required fields.".bgBrightRed.bold);
        return null;
    }

    // to check to is a valid email
    if (!to.includes('@') || !to.includes('.')) {
        console.log("Invalid email address.");
        return null;
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const emailLines = [
        `To: ${to}`,
        'Content-type: text/html;charset=iso-8859-1',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        body,
    ];
    const email = emailLines.join('\r\n').trim();
    const base64EncodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: base64EncodedEmail,
        }
    }).catch(error => {
        console.error("Error sending email: ", error);
        throw error;
    });

    console.log('Email sent:'.green.bold, res);
    return res.data;
}
// Remove the duplicate declaration of setTimeoutPromise
async function getLatestEmails(auth, maxResults = 10) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'], // Filter to get only inbox emails
        maxResults: maxResults,
    });

    if (!res.data.messages || res.data.messages.length === 0) {
        console.log('No messages found.'.red.bgBlue);
        return;
    }

    console.log("Latest messages: ");
    res.data.messages.forEach((message) => {
        console.log(`- ${message.id}`.cyan.bold);
    });

    // Fetch email contents in parallel
    const emailPromises = res.data.messages.map(async (message) => {
        const { decodedBody, senderEmail } = await fetchEmailContent(gmail, message.id);
        const mainText = extractMainText(decodedBody);
        console.log("Main Text: ".yellow.bgBrightGreen, mainText);

        // Process each email after getting the main text
        // if the sender is no-reply, do not process the email
        if (senderEmail === null || senderEmail === "" || senderEmail.includes('no-reply') || senderEmail.includes('noreply') || senderEmail.includes('no_reply') || senderEmail.includes('donotreply') || senderEmail.includes('do-not-reply')) {
            console.log("Email from no-reply || No Email || Skipping...".bgRed.bold);
            return;
        }
        await addEmailToQueue(message.id, senderEmail, mainText)
            .then(() => console.log("Email added to queue successfully.".green.bold))
            .catch(console.error);
    });

    await Promise.all(emailPromises);
    await setTimeoutPromise(5000);

    return res.data;
}

// Function to fetch the email content
async function fetchEmailContent(gmail, messageId) {
    const messageContent = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
    });

    const headers = messageContent.data.payload.headers;
    const senderHeader = headers.find(header => header.name === 'From');
    
    if (senderHeader) {
        const sender = senderHeader.value;
        const senderEmailMatch = sender.match(/<(.*)>/);
        
        if (senderEmailMatch && senderEmailMatch[1]) {
            const senderEmail = senderEmailMatch[1].trim();
            console.log("Sender Email: ".bgBrightBlue.inverse, senderEmail);
        
            const parts = messageContent.data.payload.parts || [];
            let bodyData = '';

            function extractPart(parts) {
                let textPlain = '';
                let textHtml = '';
                
                for (const part of parts) {
                    if (part.mimeType === 'text/plain') {
                        textPlain = part.body.data;
                    } else if (part.mimeType === 'text/html') {
                        textHtml = part.body.data;
                    } else if (part.parts) {
                        const nestedParts = extractPart(part.parts);
                        if (nestedParts.textPlain) textPlain = nestedParts.textPlain;
                        if (nestedParts.textHtml) textHtml = nestedParts.textHtml;
                    }
                }

                return { textPlain, textHtml };
            }

            const { textPlain, textHtml } = extractPart(parts);

            if (!textPlain && !textHtml) {
                console.log("No content found.".bgRed.bold);
                return { decodedBody: '', senderEmail: null };
            }

            let decodedBody = '';
            if (textPlain) {
                decodedBody = Buffer.from(textPlain, 'base64').toString('utf-8');
            } else if (textHtml) {
                decodedBody = Buffer.from(textHtml, 'base64').toString('utf-8');
            }

            return { decodedBody, senderEmail };
            
        } else {
            console.log("Sender Email not found in header.");
            return { decodedBody: '', senderEmail: null };
        }
    } else {
        console.log("From header not found.");
        return { decodedBody: '', senderEmail: null };
    }
}

// Function to extract the main text from the email content
function extractMainText(content) {
    // Check if the content is HTML
    if (/<[a-z][\s\S]*>/i.test(content)) {
        // If HTML, use Cheerio to extract text
        const $ = cheerio.load(content);
        let text = $('body').text();
        // Normalize whitespace and line breaks
        text = text.replace(/\s+/g, ' ').replace(/(\r\n|\n|\r)+/g, '\n').trim();
        return text;
    } else {
        // If not HTML, assume it's plain text and normalize whitespace and line breaks
        return content.replace(/\s+/g, ' ').replace(/(\r\n|\n|\r)+/g, '\n').trim();
    }
}

async function processEmail(messageId, sender, mainText) {
    const gmail = google.gmail({ version: 'v1', auth })

    console.log("Decoded Email: ".green.bgWhite, mainText);
    const emailContent = mainText.trim();

    if (!emailContent || emailContent === "") {
        console.log("Email content is empty..".bgRed.bold);
        return;
    }

    const category = await categorizeEmail(emailContent);
    console.log("Category: ".magenta, category)

    console.log("Category in progress: ".bgBlack.white, category);

    if (category==='INTERESTED' || category==='NOT INTERESTED' || category==='MORE INFO NEEDED') {
        const responseEmail = await generateResponseEmail(category, mainText, sender);
        console.log("Response Email in progress: ".cyan.bold, responseEmail);
    

        if (category === 'INTERESTED') {
            console.log("Marking email with label: ".bgMagenta.brightWhite, category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Thank For Interest', responseEmail).then().catch(console.error);
        } else if (category === 'NOT INTERESTED') {
            console.log("Marking email with label: ".bgBrightMagenta.white, category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Thank You', responseEmail).then().catch(console.error);
        } else if (category === 'MORE INFO NEEDED') {
            console.log("Marking email with label: ".bgBrightBlue.white, category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Reply for More Information', responseEmail).then().catch(console.error);
        }
    } else {
        console.log("Category not found.".red.bold);
    }
    await markEmailWithLabel(auth, messageId, 'PROCESSED').then().catch(console.error);
    console.log("Email processed successfully.".green.bold);
    return
}

async function createLabel(auth, labelName) {
    if(!labelName) {
        console.log("Label name is required.".bgRed.bold);
        return null;
    }

    const gmail = google.gmail({ version: 'v1', auth });

    const labelList = await listOfLabels(auth);

    if (labelList.includes(labelName.toUpperCase())) { 
        console.log("Label already exists.");
        return null;
    }
    
    const res = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
            name: labelName.toUpperCase(),
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show'
        }
    });

    console.log('Label created:'.yellow.bgGreen, res.data);
    // return the label id
    return res.data.id
}

// Function to mark an email with a given label name
async function markEmailWithLabel(auth, messageId, labelName) {
    const gmail = google.gmail({ version: 'v1', auth });
    
    // Fetch all labels
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const labels = labelsRes.data.labels;
    
    // if the labelList does not contain the labelName, create the label
    if (!labels.find(label => label.name === labelName)) {
        await createLabel(auth, labelName);
        console.log("Label created: ", labelName)
    }

    // Find the label ID that matches the given label name (case sensitive)
    const label = labels.find(label => label.name === labelName);
    
    if (!label || !label.id || label.id === "") {
        console.log(`Label not found: ${labelName}`);
        return null;
    }

    const labelId = label.id;
    console.log('Label ID:'.bgBrightYellow.black, labelId);

    // Mark the email with the found label ID
    const res = gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
            addLabelIds: [labelId],
            removeLabelIds: [],
        }
    }).then(() => {
        console.log('Email marked with label:'.bgBrightCyan.black, res.data);
        return res.data;
    }).catch(console.error);

    console.log('Email marked with label:', res.data);
    return res.data;
}

async function addEmailToQueue( messageId, sender, mainText) {
    try {
      await emailQueue.add('processEmail', {
        messageId: messageId,
        sender: sender,
        mainText: mainText,
      }, {
        delay: 8000,
        attempts: 2,
      }).then((job) => {
        console.log('Job added: '.bgBrightYellow.bold, job.id);
      }).catch(console.error);
    } catch (error) {
      console.log('Error in addEmailToQueue: ', error);
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
// Worker to process emails from the queue with a delay between jobs
const emailWorker = new Worker('emailProcessingQueue', async (job) => {
    console.log("Email Worker is processing job: ".bgBrightMagenta.white.bold + "\nJob ID: ".bgBlue + job.id + "\nJOB Sender".bgBlue + job.data.sender + "\nmainText ".bgBrightBlue + job.data.mainText + "\nJob Message ID ".bgBlue + job.data.messageId);

    try {
        if (!job.data.sender || !job.data.mainText || !job.data.messageId) {
            console.log("Missing required fields.".bgRed.bold);
            return;
        }

        // checking if the sender is an email address
        if (!job.data.sender.includes('@') || !job.data.sender.includes('.') || !job.data.sender.match(/com|net|org|edu|gov/)) {
            console.log("Invalid email address.".bgRed.bold);
            return;
        }

        await processEmail(job.data.messageId, job.data.sender, job.data.mainText);
        console.log("Email processed successfully.".bgGreen.white.bold);
    } catch (error) {
        console.log('Error in emailWorker: ', error.toString().red.bold);
        throw error;
    }

    // Introduce a delay of 5 seconds before the worker processes the next job
    await delay(5000);
}, { connection });



async function checkNewEmails(auth) {
    console.log('Checking for new emails...'.magenta.bold)

    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const res = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        q: '-label:PROCESSED',
        maxResults: 2,
      });
  
      if (res.data.messages && res.data.messages.length > 0) {
        for (const message of res.data.messages) {
          const { decodedBody, senderEmail } = await fetchEmailContent(gmail, message.id);
          const mainText = extractMainText(decodedBody);
  
          await addEmailToQueue(message.id, senderEmail, mainText);
        }
      } else {
        console.log('No new emails found.'.red.bold);
      }
    } catch (error) {
      console.log('Error in checkNewEmails: '.red.bold, error);
    }
}


export {
    sendEmail,
    getLatestEmails,
    createLabel,
    markEmailWithLabel,
    processEmail,
    addEmailToQueue,
    checkNewEmails,
    emailQueue,
    emailWorker
};