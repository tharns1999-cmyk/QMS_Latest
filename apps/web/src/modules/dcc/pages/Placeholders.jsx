import React from 'react';

export const AdminHealth = () => <div className="p-6 bg-white rounded shadow"><h2>System Health (Admin)</h2></div>;

export const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-full">
    <h1 className="text-4xl font-bold text-gray-800  mb-4">404</h1>
    <p className="text-gray-600 ">Page Not Found</p>
  </div>
);
