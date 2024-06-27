import fs from 'fs'
import { google } from 'googleapis'
import path from 'path'
import process from 'process'
import { authenticate } from '@google-cloud/local-auth'
import { promises as fsPromises } from 'fs';
import { exec } from 'child_process';
import http from 'http';


const SCOPES = [
    'https://www.googleapis.com/auth/drive.metadata.readonly', 
    'https://www.googleapis.com/auth/drive.file', 
    'https://www.googleapis.com/auth/gmail.send', 
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
]


// Fetch and store token from file
const TOKEN_PATH = path.join(process.cwd(), './src/credentials/token.json');

const CREDENTIALS_PATH = path.join(process.cwd(), './src/credentials/credentials.json');

// Read previously authorized  credentials from file

async function loadSavedCredentials() {
    try {
        await fsPromises.access(TOKEN_PATH, fs.constants.F_OK);
        const content = await fsPromises.readFile(TOKEN_PATH, 'utf8'); // Added 'utf8' to directly get a string

        if (content && content.length > 0 && content.trim() !== '' && content !== null){
            const credentials = JSON.parse(content);
            return google.auth.fromJSON(credentials);
        }

        return null;
        
    } catch (error) {
        console.log('Error loading credentials from file:', error);
    }
}

// 
async function saveCredentials(client) {
    try {
        const content = await fsPromises.readFile(CREDENTIALS_PATH, 'utf8'); // Added 'utf8' to directly get a string
        const keys = JSON.parse(content);

        const key = keys.web || keys.installed;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: process.env.GOOGLE_CLIENT_ID || key.client_id,
            client_secret: process.env.GOOGLE_CLIENT_SECRET || key.client_secret,
            refresh_token: client.credentials.refresh_token,
        });

        await fsPromises.writeFile(TOKEN_PATH, payload);
        console.log('Token stored to', TOKEN_PATH);
        console.log("payload", payload);

    } catch (error) {
        console.log('Error saving credentials to file:', error);
        return null;
    }
}


// Create an OAuth2 client with the given credentials, and then execute the given callback function.

async function authorize() { 
    let client = await loadSavedCredentials();
    if (client && client.credentials && client.credentials.refresh_token) {
        return client;
    }

    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    })

    if (client.credentials) {
        await saveCredentials(client);
    }

    return client;
}
authorize().then((client) => { 
    //console.log('Client:', client);
    console.log('Client Credentials:', client.credentials.refresh_token);
   // console.log('Client Credentials:', client.credentials);
});


export { authorize }