import React from 'react';
import {Provider} from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import {store, persistor} from './src/redux/store';
import RootNav from './src/navigation/rootNav';

function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
      <RootNav />
      </PersistGate>
    </Provider>
  );
}

export default App;
