import { getLatestEmails, getEmailsFromQueue, checkNewEmails } from "./src/services/gmail-services/gmailApiService.js";
import { authorize } from "./src/services/gmail-services/googleApi.js";

export const auth = await authorize();
console.log("auth apikey: ".brightMagenta.bold, auth._clientSecret);

export async function main() {
    try {
       
        console.log("Starting Gmail Automation".cyan.bold);
        const latestEmails = await getLatestEmails(auth, 3);
        console.log("Latest emails: ".bgGreen.white, latestEmails);

        const emailsFromQueue = await getEmailsFromQueue();
        console.log("Emails from queue: ".yellow.bold, emailsFromQueue);
        let val = 0;
        setInterval(async () => {
            console.log("after 20 seconds interval: ".magenta.bgWhite + val);
            try {
                console.log("Checking for new emails from server.js...");
                const newEmails = await checkNewEmails(auth);
                console.log("New emails: ", newEmails);
            } catch (error) {
                console.error("Error checking new emails: ".red.bold, error);
            }finally{
                val = val + 20;
            }
        }, 20000);
    } catch (error) {
        console.error("Error in main function: ".red.bold, error);
    }
}

main();