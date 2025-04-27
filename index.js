/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import app from './app.json';

const appName = app.name;

AppRegistry.registerComponent(appName, () => App);
