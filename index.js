const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

class Listeners {
    constructor() {
        this.apiEndpoint = "https://api-inference.huggingface.co/models/";
        this.count = 1;
        this.cache = new Map(); // Caching layer
        this.requestHeaders = {
            'Authorization': `Bearer ${process.env.AUTH1}`
        };
    }

    // Advanced query with caching and enhanced error handling
    async query(payload, message, userId, contextArray, chatbot) {
        const cacheKey = `${userId}-${message}-${chatbot}`;
        if (this.cache.has(cacheKey)) {
            console.log("Returning cached response");
            return this.cache.get(cacheKey);
        }

        let badReply = true;
        let reply = "";
        let retryCount = 0;

        if (!chatbot) chatbot = "deepparag/Aeona";
        if (!payload.inputs) payload.inputs = { generated_responses: [], past_user_inputs: [] };

        // Populate context
        contextArray.forEach((context, index) => {
            if (context) {
                if (index % 2 === 0) payload.inputs.generated_responses.push(context);
                else payload.inputs.past_user_inputs.push(context);
            }
        });

        // AIML processing if using the specific chatbot model
        if (chatbot === "deepparag/Aeona" && !message.includes(":")) {
            try {
                const aimlResponse = await axios.post(
                    `${process.env.AIML_ENDPOINT}?test=test&id=${userId}&text=${message}`
                );
                const responseText = aimlResponse.data;
                console.log("AIML response: ", responseText);

                if (!this.isInvalidResponse(responseText)) {
                    reply = responseText.replace("<br/>", "\n");
                    badReply = false;
                }
            } catch (error) {
                console.error("AIML Error: ", error);
            }
        }

        // Fallback to Hugging Face model
        while (badReply && retryCount < 5) {
            try {
                const response = await axios.post(this.apiEndpoint + chatbot, payload, { headers: this.requestHeaders });
                reply = response.data.generated_text;
                
                if (reply) {
                    badReply = false;
                    this.cache.set(cacheKey, reply); // Cache response
                    setTimeout(() => this.cache.delete(cacheKey), 300000); // Cache expires in 5 minutes
                }
            } catch (error) {
                console.error("Model Error: ", error.response ? error.response.data : error.message);
                
                // Retry with exponential backoff
                const delay = Math.pow(2, retryCount) * 100; // Delay in ms
                console.log(`Retrying in ${delay} ms...`);
                await new Promise(res => setTimeout(res, delay));
                
                retryCount++;
                if (retryCount === 5) return "Hmm, there was an error loading up the model. Please wait and try again later.";
                
                this.updateRequestHeaders(); // Rotate API key on error
            }
        }

        console.log("AI response: ", reply);
        return reply ? reply.replace("<br />", "\n") : "No response.";
    }

    isInvalidResponse(responseText) {
        const invalidPhrases = ["idk", "I have no answer", "<oob>", "Something is wrong", "AIML", "Index", "<html>"];
        return invalidPhrases.some((phrase) => responseText.includes(phrase));
    }

    updateRequestHeaders() {
        this.count = this.count === 4 ? 1 : this.count + 1;
        this.requestHeaders.Authorization = `Bearer ${process.env[`AUTH${this.count}`]}`;
    }
}

const app = express();
const listener = new Listeners();

app.use(express.json());

app.get('/', async (req, res) => {
    const { key, text, userId, chatbot } = req.query;
    const contextArray = [
        req.query.context, req.query.context1, req.query.context2,
        req.query.context3, req.query.context4, req.query.context5,
        req.query.context6, req.query.context7
    ];

    if (!key || key !== process.env.API_KEY) return res.send("Invalid API key");

    const payload = {
        inputs: {
            text: text,
            generated_responses: [],
            past_user_inputs: []
        },
        options: {
            wait_for_model: true
        }
    };

    try {
        const response = await listener.query(payload, text, userId, contextArray, chatbot);
        res.send(response);
    } catch (error) {
        console.error("Error: ", error);
        res.send("There was an error: " + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
