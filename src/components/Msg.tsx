"use client";
import { useEffect, useState } from "react";

export default function MessageTime({ date }: { date: Date }) {
  const [mounted, setMounted] = useState(false);
  const [timeString, setTimeString] = useState("");

  useEffect(() => {
    setMounted(true);
    setTimeString(date.toLocaleTimeString());
  }, [date]);

// Avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="text-[10px] opacity-60 mt-1 text-right hidden text-gray-600 dark:text-blue-200" suppressHydrationWarning>
      </div>
    );
  }

  return (
    <div className="text-[10px] opacity-60 mt-1 text-right hidden text-gray-600 dark:text-blue-200">
      {timeString}
    </div>
  );
}
