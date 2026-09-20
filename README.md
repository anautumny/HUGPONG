# HUGPONG - Agricultural Management Platform

An offline-first agricultural management system designed specifically for sugarcane block farm operations in Silay City. This capstone project bridges the gap between field-level manual data collection and regional administrative oversight through a unified mobile application and web dashboard ecosystem.

## Project Structure

*   **/mobile**
    React Native (Expo) application utilizing AsyncStorage for offline-first data caching. Designed for Field Members and Farm Managers to log the 8-stage crop cycle without requiring an active internet connection.
*   **/admin**
    Web-based administration console built with HTML, CSS (Tailwind CSS v4), and JavaScript. Designed for Farm Managers and SRA (Admin) to review descriptive analytics, track weekly SRA sugar prices, and generate certified audit reports.

### Key Features
*   **Offline-First Field Logging**: Members log operations offline; Managers approve them when online.
*   **Dynamic Role Switcher**: UI dynamically adapts to 4 roles (Member, Farm Manager, SRA (Admin), Super Admin) instantly.
*   **Visual Diagnostic Dashboard**: Real-time breakdown of operational expenses, crop stages, and SRA prices using custom UI components.
*   **Role-Based Access Control (RBAC)**: Strict permission tiers separating Field Members, Farm Managers, SRA (Admin), and Super Admins.
*   **SRA QR Audit Verification**: End-to-end audit capability allowing SRA (Admin) to verify and certify field operation logs via encrypted hash codes.

## Getting Started

To run the complete HUGPONG ecosystem locally, utilize the provided batch scripts in the root directory:

1.  **Start the Backend Server**
    Run `run-server.bat` to initialize the Node.js backend.
2.  **Start the Mobile Application**
    Run `run-mobile.bat` to launch the React Native Expo server.
3.  **Start the Admin Web Dashboard**
    Run `run-admin.bat` to open the local administrative console in your default web browser.

For Expo Go on a physical phone, keep the phone and computer on the same Wi-Fi network and set `mobile/.env` to the computer's LAN address, for example `EXPO_PUBLIC_API_BASE_URL=http://10.253.28.161:3000`. Use `http://10.0.2.2:3000` only with an Android emulator. Restart Expo after changing this value.

---
Developed as a Capstone Project for Agricultural Information Systems.
