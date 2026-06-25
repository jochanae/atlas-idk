import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Editor from './components/Editor';

const App: React.FC = () => {
  return (
    <div className="container mx-auto p-4">
      <Routes>
        <Route path="/" element={<Editor />} />
      </Routes>
    </div>
  );
};

export default App;