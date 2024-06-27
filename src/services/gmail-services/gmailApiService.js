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


async function listOfLabels(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.labels.list({
        userId: 'me',
    });

    const labels = res.data.labels;
    if (labels.length && labels.length > 0) {
        console.log('Labels:');
        labels.forEach((label) => {
            console.log(`- ${label.name}`);
        });

        return labels;
    } else {
        console.log('No labels found.');
        return null;
    }
}

async function sendEmail(auth, to, subject, body) {
    if (to === "" || subject === "" || body === "") {
        console.log("Email not sent. Missing required fields.");
        return null;
    }

    // to check to is a valid email
    if (!to.includes('@', '.')) {
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

    const beautifiedEmail = util.inspect(email, { showHidden: false, depth: null, colors: true });  

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: beautifiedEmail,
        }
    }).then(() => {
        //,mark the email as processed
        //markEmailWithLabel(auth, messageId, 'PROCESSED').then().catch(console.error);
    }).catch(console.error);
    console.log('Email sent:'.green.bold, res.data);
    return res.data;
}

async function getEmails(auth, maxResults) {
    const gmail = google.gmail({ version: 'v1', auth });
    const emails = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        maxResults: maxResults
    });

    emails.data.messages.forEach(async (email) => {
        const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: email.id,
        });

        console.log(emailData.data.snippet);
    })
    console.log(emails.data.messages);
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
        if (senderEmail === null || senderEmail === "" || senderEmail.includes('no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply')) {
            console.log("Email from no-reply || No Email || Skipping...".bgRed.bold);
            return;
        }
        await addEmailToQueue(auth, message.id, senderEmail, mainText)
            .then(console.log("Email added to queue successfully.".green.bold))
            .catch(console.error);
        //console.log("Add Email Response: ", addRes)
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
    const sender = headers.find(header => header.name === 'From').value;
    const senderEmail = sender.substring(sender.indexOf('<') + 1, sender.indexOf('>'));
    console.log("Sender Email: ", senderEmail);

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
        return { decodedBody: '', senderEmail };
    }

    let decodedBody = '';
    if (textPlain) {
        decodedBody = Buffer.from(textPlain, 'base64').toString('utf-8');
    } else if (textHtml) {
        decodedBody = Buffer.from(textHtml, 'base64').toString('utf-8');
    }

    return { decodedBody, senderEmail };
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


async function processEmail(auth, messageId, sender, mainText) {
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
            console.log("Marking email with label: ", category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Thank For Interest', responseEmail).then().catch(console.error);
        } else if (category === 'NOT INTERESTED') {
            console.log("Marking email with label: ", category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Thank You', responseEmail).then().catch(console.error);
        } else if (category === 'MORE INFO NEEDED') {
            console.log("Marking email with label: ", category)
            await markEmailWithLabel(auth, messageId, category).then().catch(console.error);
            console.log("Sending email to: ".green.bold, sender)
            sendEmail(auth, sender, 'Reply for More Information', responseEmail).then().catch(console.error);
        }
    } else {
        console.log("Category not found.".red);
    }
    await markEmailWithLabel(auth, messageId, 'PROCESSED').then().catch(console.error);
    console.log("Email processed successfully.".green.bold);
    return
}

async function createLabel(auth, labelName) {
    if(!labelName) {
        console.log("Label name is required.");
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

    console.log('Label created:', res.data);
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
    
    if (!label) {
        console.log(`Label not found: ${labelName}`);
        return null;
    }

    const labelId = label.id;

    // Mark the email with the found label ID
    const res = gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
            addLabelIds: [labelId],
            removeLabelIds: [],
        }
    });

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
        delay: 10000,
        attempts: 2,
      }).then((job) => {
        console.log('Job added: ', job.id);
      }).catch(console.error);
    } catch (error) {
      console.log('Error in addEmailToQueue: ', error);
    }
}
  
// Worker to process emails from the queue
const emailWorker = new Worker('emailProcessingQueue', async (job) => {

    console.log("Email Worker is processing job: ")

    try {
        await processEmail(auth, job.data.messageId, job.data.sender, job.data.mainText)
            .then(console.log("Email processed successfully."))
            .catch(console.error);
    } catch (error) {
      console.log('Error in emailWorker: ', error);
      throw new Error(error);
    }
  }, { connection });
  

async function getEmailsFromQueue() {
    const jobs = await emailQueue.getJobs(['waiting', 'active']);
    console.log("Jobs: ", jobs);

    jobs.forEach((job) => {
        console.log(`Job email: ${job.data.sender} - ${job.data.mainText} - ${job.data.messageId} - ${job.id}`);
    })

    return jobs;
}

async function checkNewEmails(auth) {
    console.log('Checking for new emails...')

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
        console.log('No new emails found.');
      }
    } catch (error) {
      console.log('Error in checkNewEmails: ', error);
    }
  }


export {
    listOfLabels,
    sendEmail,
    getLatestEmails,
    createLabel,
    markEmailWithLabel,
    processEmail,
    getEmails,
    addEmailToQueue,
    getEmailsFromQueue,
    checkNewEmails,
    emailQueue,
    emailWorker
};