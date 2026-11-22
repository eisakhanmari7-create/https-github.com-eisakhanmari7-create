import React from 'react';
import { Header } from './components/Header';
import { CleanVideoStudio } from './components/CleanVideoStudio';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5">
        <CleanVideoStudio />
      </main>
    </div>
  );
}
