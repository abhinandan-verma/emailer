# Email-AI

## Overview

Email-AI is a tool that automates the process of reading, categorizing, and responding to emails in Google and Outlook accounts based on the context using AI. The tool leverages BullMQ for task scheduling and OpenAI for context understanding and automated replies. The tool is built using TypeScript and Next.js.

## Features

- OAuth integration with Gmail and Outlook for secure email access
- Context understanding of emails using Gemini AI
- Automatic email categorization into labels: Interested, Not Interested, More Information
- Automated email replies based on the context
- Task scheduling using BullMQ, Redis

## Live Demo Requirements

1. Connect new email accounts for both Google and Outlook(in progress) using OAuth.
2. Send an email to these accounts from another account.
3. Showcase the tool reading incoming emails to the connected accounts.
4. Categorize the email based on the content and assign a label:
   - Interested
   - Not Interested
   - More Information
5. Suggest an appropriate response based on the email content and send a reply. For example:
   - If the email mentions interest in knowing more, the reply should ask if they are willing to hop on a demo call by suggesting a time.
6. The tool must run automatically without manual endpoint activation.

## Getting Started

### Prerequisites

- Node.js
- NPM or Yarn
- A Google Cloud project with OAuth crede
- Docker Redis or Redis Desktop

## Before You Start
- Contact [abhinandanverma551@gmail.com], get the credentials.json file
- OR
- go to [https://console.cloud.google.com/apis/dashboard]
-  create a project
- setup O Auth Screen Consent
- set redirect_uris = ``http:localhost:3000/oAuth2callback``
- Save
- Download the `credential json` file
- paste in into file ``/src/credentials/credentials.json``
- ensure the correctness of file name
- Complete your credentials in ``.env`` file in root folder

# DemoVideo to start

https://github.com/abhinandan-verma/emailer/assets/147910430/d3a9374d-6136-47b5-bfbe-64b9d12a2ede

ntials
- An Azure app registration for Outlook OAuth credentials
- OpenAI API key



### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/email-ai.git
   cd email-ai
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:

   ```env
   OPENAI_API_KEY=your_openai_api_key
   GEMINI_API_KEY=your_gemini_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   EMAIL=your_gmail_address
   PASSWORD=your_gmail_password
   NEXT_PUBLIC_URL=http://localhost:3000
   PORT=3000
   ```

### Running the Application

1. Start the OAuth setup for Gmail:

   ```bash
   npm run gmail
   ```

2. For subsequent runs, start the application:

   ```bash
   node index.js
   ```

### Project Structure

- `src/`: Contains the source code
  - `oauth/`: OAuth setup for Gmail and Outlook
  - `tasks/`: BullMQ task definitions and schedulers
  - `controllers/`: Email handling and processing logic
  - `utils/`: Utility functions

### Key Components

1. **OAuth Setup:**
   - Configures OAuth access for Gmail and Outlook.
   - Handles token generation and refresh.

2. **Email Processing:**
   - Reads incoming emails.
   - Categorizes emails using OpenAI.
   - Assigns labels based on the content.

3. **Automated Responses:**
   - Generates response emails using OpenAI based on the categorized context.
   - Sends automated replies to the original sender.

4. **Task Scheduling:**
   - Uses BullMQ to schedule and manage tasks for reading, categorizing, and responding to emails.

## How to Use

1. Connect your email accounts (Gmail and Outlook) via OAuth.
2. The tool will automatically start checking for new emails every 5 minutes.
3. Incoming emails will be read, categorized, and labeled.
4. Appropriate responses will be generated and sent back to the sender.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
```

## Contact

For any queries, please contact [abhinandanverma551@gmail.com].
```
