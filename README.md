# Bill Splitter

GitHub: [https://github.com/trchopan/bill-splitter](https://github.com/trchopan/bill-splitter)

A SvelteKit application designed to simplify splitting bills and facilitating payments via Payment QR code (EMVCo) standard. This tool allows users to easily convert receipt data into a digital bill, share it with friends, and generate payment QR codes for seamless bank transfers.

## Features

- **AI-Assisted Receipt Parsing**: Provides a specialized prompt to extract receipt data (items, prices, tax, tip) into a strict JSON format using multimodal AI tools like ChatGPT or Claude.
- **Bill Creation**: Users can verify and edit the extracted bill data, and add their bank account details.
- **Shareable Bill Links**: Generates a stateless, URL-encoded link to share with friends. No database required.
- **Interactive Item Selection**: Friends can open the link, select the specific items and quantities they consumed.
- **Automatic Split Calculation**: Automatically calculates the individual share, proportionally distributing tax, tips, and discounts based on the selected items.
- **Payment QR Code**: Generates a dynamic Payment QR Code (EMVCo compatible) code for the exact calculated amount, enabling direct payment to the bill owner's bank account via banking apps.
- **Privacy Focused**: All data is stored in the URL or local browser state. No server-side storage.

## Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **QR Generation**: `qrcode`
- **Validation**: `ajv`
- **Testing**: Vitest (Unit), Playwright (E2E)

## Getting Started

### Prerequisites

- Bun

### Installation

1.  Clone the repository:

    ```bash
    git clone <repository-url>
    cd bill-splitter
    ```

2.  Install dependencies:
    ```bash
    bun install
    ```

### Development

Start the development server:

```bash
bun run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To create a production version of the app:

```bash
bun run build
```

You can preview the production build with `bun run preview`.

## Usage Guide

1.  **Extract Data**: Use the "Copy AI prompt" feature on the home page. Upload your receipt image to an AI tool (like ChatGPT) and paste the prompt.
2.  **Create Bill**: Copy the JSON output from the AI and paste it into the "Paste AI JSON" section.
3.  **Setup Bank**: Select your bank and enter your account number.
4.  **Share**: Click "Generate share link" and send the URL to your friends.
5.  **Select & Pay**: Friends open the link, select their items, and click "Generate QR" to pay via their banking app.

## Project Structure

- `src/lib/bill`: Core logic for bill validation, types, and calculation utilities.
- `src/lib/emvcode`: Utilities for generating EMVCo compatible QR payloads.
- `src/routes`: SvelteKit routes.
    - `/`: Home page (Bill creation).
    - `/bill`: Shared bill view for item selection.
    - `/qr`: Standalone QR display page.

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2025-present, Quang Tran.
