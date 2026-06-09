# SimplySend - Node.js SDK Sample Web Application

<p align="center">
  <img src="public/logo.png" alt="SimplySend Logo" width="120" />
</p>

A clean, premium, glassmorphic Node.js web application designed to test both the Transactional and Marketing APIs from the `simplysend` SDK.

---

## Features
- **Transactional Sends (`tapi`)**: Interactive form to send OTPs, alerts, and system triggers.
- **Marketing Sends (`mapi`)**: Form to send newsletter campaigns to subscriber list audiences (`subscriptionGroupId`).
- **Secure Credentials**: Credentials (`SIMPLYSEND_ACCOUNT_ID`, `SIMPLYSEND_TAPI_KEY`, `SIMPLYSEND_MAPI_KEY`) are kept safe on the server side in a `.env` file and never exposed to the frontend.

---

## Project Structure
- `server.js` - Secure Express API routing and SDK client integration.
- `public/` - Static frontend content containing:
  - `index.html` - Transactional email sending interface.
  - `marketing.html` - Marketing campaign email sending interface.
  - `style.css` - Sleek dark glassmorphic stylesheet.

---

## Setup & Execution

### 1. Clone the Repository
Clone the repository to your local development machine:
```bash
git clone https://github.com/simply-invent-labs/simply-send-sample-app.git
cd simply-send-sample-app
```

### 2. Configure Settings
Create a `.env` file in the root of the project folder:
```bash
cp .env.example .env
```

Open the `.env` file and populate it with your SimplySend dashboard credentials:
```env
SIMPLYSEND_ACCOUNT_ID=your_account_id_here
SIMPLYSEND_TAPI_KEY=your_transactional_api_key_here
SIMPLYSEND_MAPI_KEY=your_marketing_api_key_here
PORT=3005
```

### 3. Install Dependencies
Install Express and link the local Node.js SDK:
```bash
npm install
```

### 4. Start the Server
Start the development server:
```bash
npm start
```

Open your browser and navigate to:
- **Transactional Tester**: [http://localhost:3000](http://localhost:3000)
- **Marketing Tester**: [http://localhost:3000/marketing.html](http://localhost:3000/marketing.html)

---

## Security & Dependency Maintenance

To ensure the application remains secure and free from dependency vulnerabilities, follow these steps:

### 1. Update Express (or other dependencies)
To upgrade Express to the latest version:
```bash
npm install express@latest
```

### 2. Audit Dependencies
Check the dependency tree for known security issues:
```bash
npm audit
```

### 3. Fix Vulnerabilities Automatically
Apply safe security patches automatically:
```bash
npm audit fix
```
If there are major version updates required to resolve deep vulnerabilities, run:
```bash
npm audit fix --force
```

---

## License
MIT
