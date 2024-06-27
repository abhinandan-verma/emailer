// src/app/oauth2Client.ts
import { google } from 'googleapis';

const { OAuth2 } = google.auth;

const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_URL}/api/oauth2callback`
);

export default oauth2Client;
