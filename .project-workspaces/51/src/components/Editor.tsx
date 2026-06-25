import React from 'react';

const Editor: React.FC = () => {
  return (
    <div className="bg-gray-100 p-4 rounded shadow-md space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Safe Code Edit Pipeline</h1>
      </div>
      <div>
        <h2 className="text-lg">What Atlas Understood</h2>
        <pre className="bg-white p-2 rounded">/* Mock AI's understanding */</pre>
      </div>
      <div>
        <h2 className="text-lg">Affected Files</h2>
        <ul className="bg-white p-2 rounded">
          <li>File1.ts</li>
          <li>File2.ts</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg">Proposed Diff</h2>
        <pre className="bg-white p-2 rounded">/* Mock diff here */</pre>
      </div>
      <div>
        <h2 className="text-lg">Risk Warnings</h2>
        <div className="bg-yellow-100 p-2 border-l-4 border-yellow-500">/* Mock warning message */</div>
      </div>
      <div className="flex space-x-4">
        <button className="bg-green-500 text-white px-4 py-2 rounded">Apply</button>
        <button className="bg-red-500 text-white px-4 py-2 rounded">Reject</button>
      </div>
      <div>
        <h2 className="text-lg">Build/Test Result</h2>
        <pre className="bg-white p-2 rounded">/* Mock result message */</pre>
      </div>
      <div>
        <h2 className="text-lg">Rollback Option</h2>
        <button className="bg-blue-500 text-white px-4 py-2 rounded">Rollback</button>
      </div>
    </div>
  );
};

export default Editor;