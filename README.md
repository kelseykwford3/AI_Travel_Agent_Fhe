# AI Travel Agent: Your Personal Travel Assistant, Powered by Zama FHE

Imagine a travel experience where your preferences and privacy are safeguarded seamlessly. Our AI Travel Agent revolutionizes the way you plan and book your trips, utilizing **Zama's Fully Homomorphic Encryption (FHE) technology** to ensure your data remains confidential while you enjoy exquisite travel experiences. 

## Solving the Privacy Dilemma in Travel

In an age where personal data is constantly at risk of exposure, striking a balance between convenience and privacy can be challenging, especially when it comes to travel. Users often have to share sensitive information like travel preferences, budgets, and timelines with various travel platforms, risking unwanted data exposure. This raises concerns about privacy and security that many travelers cannot ignore.

## Leveraging FHE to Enhance Privacy

Our solution harnesses the power of Zama's advanced FHE technology, allowing you to interact with our AI as you would with a traditional travel agent, but with the assurance that your information remains protected. By employing Zama’s open-source libraries such as **Concrete** and **TFHE-rs**, our AI agent can process encrypted data without ever needing to decrypt it. This means your travel preferences and sensitive information can be securely handled, resulting in personalized recommendations without compromising your privacy.

## Spotlight on Features

### ✈️ Key Functionalities
- **Encrypted User Preferences:** Your travel preferences, budget, and timelines are encrypted using FHE, ensuring no personal data is exposed during processing.
- **Automated Itinerary Planning:** The AI agent autonomously researches and combines options to compose the ideal itinerary tailored to your preferences.
- **Privacy-Focused Booking:** Book flights and accommodations without revealing sensitive information to third-party travel websites.
- **Customized Recommendations:** Receive tailored travel suggestions based on your unique encrypted preferences.
- **Conversational Interface:** Interact with the AI agent in a user-friendly manner, making the experience intuitive and engaging.

## Technology Stack

Our AI Travel Agent is built on a robust technology stack designed for secure and confidential computing:
- **Zama's Fully Homomorphic Encryption SDK**: Core library for processing encrypted data.
- **Node.js**: JavaScript runtime for backend functionality.
- **Hardhat**: Development environment for Ethereum-based smart contracts.
- **Express**: To manage our RESTful API interactions.

## Directory Structure

Here’s an outline of our project structure, showcasing the essential components:

```
AI_Travel_Agent_Fhe/
├── contracts/
│   └── TravelAgent.sol
├── src/
│   ├── index.js
│   ├── api.js
│   └── agent.js
├── package.json
└── README.md
```

## Installation Instructions

To set up the AI Travel Agent locally, follow these instructions:

1. **Download the project files**: Make sure to get the complete project files from a reliable source.
2. **Install Node.js**: Ensure you have Node.js (version 14 or above) installed on your system.
3. **Navigate to the project directory**: Use your terminal to go to the project folder.
4. **Install required dependencies**: Run the command below to install the necessary libraries, including Zama FHE:
   ```bash
   npm install
   ```

> **Do not** use `git clone` or any other URLs to download the project files.

## Build & Run Instructions

Once you have installed the dependencies, you are ready to compile and run the project:

1. **Compile the smart contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run the local server**:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

3. **Interact with the API**: Open your browser or Postman to interact with the API routes defined in `src/api.js` to test the functionality of your AI Travel Agent.

## Example Usage

Here's a simple example of how to initiate a travel booking request using the API:

```javascript
const axios = require('axios');

const userPreferences = {
  encryptedData: "xxxxx", // Your encrypted travel preferences
};

axios.post('http://localhost:3000/api/book', userPreferences)
  .then(response => {
    console.log('Booking Confirmed!', response.data);
  })
  .catch(error => {
    console.error('Error in booking:', error);
  });
```

This code demonstrates how to send encrypted preferences to the AI Travel Agent and receive a confirmation for your travel booking without exposing your sensitive information.

## Acknowledgements

### Powered by Zama

We extend our gratitude to the Zama team for their groundbreaking work in Fully Homomorphic Encryption technology. Their innovative open-source tools enable us to build this confidential and privacy-preserving travel solution, paving the way for a new era of secure interactions in the blockchain landscape. Thank you for making such transformative technology accessible for developers around the world!
