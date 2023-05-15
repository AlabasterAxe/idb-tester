import React, { useEffect, useRef, useState } from 'react';
import { IDBPDatabase } from 'idb';
import './App.css';

function createRandomString(): string {
  const res = [];
  for (let i = 0; i < 100; i++) {
    res.push(Math.random().toString(36).substring(2, 15));
  }
  return res.join("");
}

function createLargeObject() {
  const res: Record<string, string> = {};
  for (let i = 0; i < 100_000; i++) {
    res[createRandomString()] = createRandomString();
  }
  return res;
}

const largeObject = createLargeObject();

function DbTask({ db, task, periodMs, name }: {db: IDBPDatabase, task: (db: IDBPDatabase, runIdx: number) => Promise<number>, periodMs: number, name: string}) {
  const [numRuns, setNumRuns] = useState(0);
  const [numCompleted, setNumCompleted] = useState(0);
  const [numErrors, setNumErrors] = useState(0);
  const [numQueued, setNumQueued] = useState(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalTimeSpentBlocked, setTotalTimeSpentBlocked] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const ref = useRef<number>(0);
  useEffect(() => {
    if (isPaused) {
      return;
    }
    const interval = setInterval(async () => {
      const start = performance.now();
      setNumRuns((numRuns) => numRuns + 1);
      setNumQueued((num) => num + 1);
      try {
        const timeBlocked = await task(db, ref.current++);
        const end = performance.now();
        setTotalTimeSpent((totalTimeSpent) => totalTimeSpent + (end - start));
        setTotalTimeSpentBlocked((time) => time + timeBlocked);
        setNumCompleted((numCompleted) => numCompleted + 1);
      } catch (_) {
        setNumErrors((numErrors) => numErrors + 1);
      } finally {
        setNumQueued((num) => num - 1);
      }
    }, periodMs);
    return () => clearInterval(interval);
  }, [db, task, periodMs, isPaused]);
  return (
    <div>
      <h1>{name}</h1>
      <button onClick={()=>setIsPaused((isPaused)=>!isPaused)}>{isPaused ? 'resume': 'pause'}</button>
      <div>Num Runs: {numRuns}</div>
      <div>Num Queued: {numQueued}</div>
      <div>Num Errors: {numErrors}</div>
      <div>Average Time Per Task: {totalTimeSpent / numCompleted}</div>
      <div>Average Time Blocked Per Task: {totalTimeSpentBlocked / numCompleted}</div>
    </div>
  )
}


function App({db}: {db: IDBPDatabase}) {
  return (
    <div className="App">
      <DbTask db={db} name="Commit Write" task={async (db, runIdx) => {
        const tx = db.transaction("commit-store", "readwrite");
        const store = tx.objectStore("commit-store");
        const start = performance.now();
        // not sure if this is legit but this is used to measure how long the task is blocked
        await store.get(1);
        const end = performance.now();
        for (let i = 0; i < 10; i++) {
          await store.put({id: runIdx * 10 + i, value: runIdx * 10 + i});
        }
        await tx.done;
        return end - start;
      }} periodMs={100}></DbTask>
      <DbTask db={db} name="Commit Scan" task={async (db, runIdx) => {
        const tx = db.transaction("commit-store", "readonly");
        const store = tx.objectStore("commit-store");
        const start = performance.now();
        // not sure if this is legit but this is used to measure how long the task is blocked
        await store.get(1);
        const end = performance.now();
        let cursor = await store.openCursor();
        while (cursor) {
          cursor = await cursor.continue();
        }
        await tx.done;
        return end - start;
      }} periodMs={500}></DbTask>
      <DbTask db={db} name="Snapshot Write" task={async (db, runIdx) => {
        const tx = db.transaction("snapshot-store", "readwrite");
        const store = tx.objectStore("snapshot-store");
        const start = performance.now();
        // not sure if this is legit but this is used to measure how long the task is blocked
        await store.get(1);
        const end = performance.now();
        await store.put({id: runIdx, value: largeObject});
        await tx.done;
        return end - start;
      }} periodMs={30_000}></DbTask>
    </div>
  );
}

export default App;
