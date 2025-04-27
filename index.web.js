import {AppRegistry} from 'react-native';
import App from './App'; // <-- if your main App component is in App.js at root
import app from './app.json';

const appName = app.name; // <-- replace with your app name from app.json

AppRegistry.registerComponent(appName, () => App);

// Only for web:
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('app-root'), // or 'root' depending on your HTML
});
