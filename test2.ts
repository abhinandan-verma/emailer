import fs from 'fs';
import { google, gmail_v1 } from 'googleapis';
import path from 'path';
import process from 'process';
import { promises as fsPromises } from 'fs';
import { authenicate } from "@"

const SCOPES: string[] = [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
];

const TOKEN_PATH: string = path.join(process.cwd(), './src/credentials/token.json');

const CREDENTIALS_PATH: string = path.join(process.cwd(), './src/credentials/credentials.json');

async function loadSavedCredentials(): Promise<google.auth.OAuth2 | null> {
    try {
        await fsPromises.access(TOKEN_PATH, fs.constants.F_OK);
        const content: string = await fsPromises.readFile(TOKEN_PATH, 'utf8');

        if (content && content.length > 0 && content.trim() !== '' && content !== null) {
            const credentials: any = JSON.parse(content);
            return google.auth.fromJSON(credentials);
        }

        return null;

    } catch (error) {
        console.log('Error loading credentials from file:', error);
        return null;
    }
}

async function saveCredentials(client: google.auth.OAuth2): Promise<void> {
    try {
        const content: string = await fsPromises.readFile(CREDENTIALS_PATH, 'utf8');
        const keys: any = JSON.parse(content);

        const key: any = keys.web || keys.installed;
        const payload: string = JSON.stringify({
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
    }
}

async function authorize(): Promise<google.auth.OAuth2> {
    let client: google.auth.OAuth2 | null = await loadSavedCredentials();
    if (client && client.credentials && client.credentials.refresh_token) {
        return client;
    }

    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });

    if (client.credentials) {
        await saveCredentials(client);
    }

    return client;
}

authorize().then((client: google.auth.OAuth2) => {
    console.log('Client Credentials:', client.credentials.refresh_token);
});

export { authorize };
