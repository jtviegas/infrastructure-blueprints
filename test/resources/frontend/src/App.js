import React from 'react';
import {BrowserRouter, Routes, Route} from 'react-router-dom'

import Header from './components/header';
import { Home } from './components/home';
import Alert from './components/alert';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Header />
        <Alert />
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
