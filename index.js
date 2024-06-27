import { authorize } from "./src/services/gmail-services/googleApi.js";
import express from "express";
import { main } from "./server.js";
import colours from "@colors/colors"

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Hello World'.bgBlue);
});


async function startServer() {
    try {
        const auth = await authorize();
        console.log("Auth apikey: ", auth._clientSecret);

        if(!auth) {
            console.error("Error authorizing credentials");
            console.log("Run 'npm run gmail' to authorize credentials".red.bold)
            process.exit(1);
        }

        // Define your routes and middleware here

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`.bgGreen.white.bold);
            main();
        });
    } catch (error) {
        console.error("Error starting server:".red.bold.bgBlue, error);
    }
}

startServer();