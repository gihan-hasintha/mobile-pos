  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
  import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBkoBOQ2HQ2fkaQk4FJGq5leQXamzMC0Fk",
    authDomain: "imapos-mobile.firebaseapp.com",
    databaseURL: "https://imapos-mobile-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "imapos-mobile",
    storageBucket: "imapos-mobile.firebasestorage.app",
    messagingSenderId: "102205518897",
    appId: "1:102205518897:web:ea549c4612bf4d6a7b9110",
    measurementId: "G-W9ZJWS24MQ"
  };

  // Initialize Firebase
  export const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);

  // Initialize Firestore and export
  export const db = getFirestore(app);