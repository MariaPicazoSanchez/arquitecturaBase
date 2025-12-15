import React from 'react';
import UnoGame from './components/UnoGame';
import './App.css'

export default function App() {
  return (
    <div className="app-root">
      <h1>Última Carta</h1>
      <UnoGame />
    </div>
  );
}