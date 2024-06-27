import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';


dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

while (!apiKey || apiKey === "") {
    console.log("API Key not found");
}

const gemini = new GoogleGenerativeAI(apiKey);

const geminiModel = gemini.getGenerativeModel({
    model: "gemini-pro"
})

async function categorizeEmail(emailBody) {

    if (!emailBody || emailBody === "") {
        return "NULL";
    }

    try {
        
        const result = await geminiModel.generateContent(
            `Categorize the following email content:\n\n"${emailBody}"\n\nCategory: Interested, Not-Interested, More information, Neutral`
        )
        const response = result.response.text()
        console.log("Response: ", response);
        
        if (response.includes("Not-Interested")) {
            return "NOT INTERESTED";
        } else if (response.includes("Interested")) {
            return "INTERESTED";
        } else if (response.includes("More information")) {
            return "MORE INFO NEEDED";
        } else {
            return "NEUTRAL";
        }

    } catch (error) {
        console.log("Error: ", error);
        return "NULL";
    }
}

async function generateResponseEmail(category, content, sender) {

    if (!category || !content) {
        return "No response generated";
    }
    
    let prompt = "";
    switch (category) {
        case "Interested":
            prompt = `Generate a positive and engaging response email for someone who is interested based on the following email content:\n\n"${content}"\nsender: ${sender}`;
            break;
        case "Not Interested":
            prompt = `Generate a polite and respectful response email for someone who is not interested based on the following email content:\n\n"${content}"\nsender: ${sender}`;
            break;
        case "More information":
            prompt = `Generate an informative response email providing more details based on the following email content:\n\n"${content}"\n\nResponse:`;
            break;
        default:
            prompt = `Generate a neutral response email based on the following email content:\n\n"${content}"\n\nResponse:`;
            break;
    }

    console.log("Prompt: ", prompt)

    const response = (await geminiModel.generateContent(prompt)).response.text();

    console.log("Response: ", response);

    if (response) {
        return response;
    }

    return "No response generated";
}

 
export { categorizeEmail, generateResponseEmail }

