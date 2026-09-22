# RLA Mobile

Expo React Native app for Android and iOS. It uses the existing `backend` API.

## Start

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_API_URL` to your computer's LAN IPv4 address, such as `http://192.168.1.10:5000/api`. A physical phone cannot use `localhost` for your computer.
3. Run `npm install --prefix mobile`.
4. Run `npm start --prefix mobile`.
5. Install **Expo Go** on the phone, connect it to the same Wi-Fi network, and scan the QR code.

For an Android emulator, use `http://10.0.2.2:5000/api` as the API URL.
