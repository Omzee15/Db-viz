"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCircle } from "lucide-react";
import { useGuest } from "@/lib/guest-context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { setGuestMode } = useGuest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";
      const body = isRegistering
        ? { email, password, name }
        : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      setGuestMode(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestMode = () => {
    setGuestMode(true);
    localStorage.removeItem("user");
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      {/* Card */}
      <div 
        className="w-full max-w-sm rounded-lg border border-gray-200 shadow-sm"
        style={{ background: '#EADFCD', padding: '28px' }}
      >
        {/* CardHeader */}
        <div style={{ marginBottom: '20px' }}>
          <h3 className="text-lg font-bold text-center text-gray-900">
            {isRegistering ? "Create an account" : "Sign in"}
          </h3>
          <p className="text-xs text-center text-gray-500" style={{ marginTop: '6px' }}>
            {isRegistering
              ? "Enter your details to create your account"
              : "Enter your credentials to access your projects"}
          </p>
        </div>

        {/* CardContent */}
        <div>
          {error && (
            <div className="px-4 py-3 rounded-md mb-4 text-sm bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isRegistering && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="name" className="text-xs font-medium text-gray-900">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required={isRegistering}
                  className="w-full rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: '#F5EEE5', height: '36px', padding: '6px 12px', border: 'none' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="email" className="text-xs font-medium text-gray-900">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                required
                className="w-full rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: '#F5EEE5', height: '36px', padding: '6px 12px', border: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="password" className="text-xs font-medium text-gray-900">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: '#F5EEE5', height: '36px', padding: '6px 12px', border: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 w-full text-white"
              style={{ background: '#9B8F5E', height: '36px', padding: '6px 16px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRegistering ? "Creating account..." : "Signing in..."}
                </>
              ) : isRegistering ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', background: '#D9CDBF' }} />
            <span className="text-xs" style={{ color: '#8B7355' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#D9CDBF' }} />
          </div>

          <button
            type="button"
            onClick={handleGuestMode}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 w-full"
            style={{ 
              marginTop: '16px',
              background: 'transparent', 
              border: '1px solid #9B8F5E',
              color: '#9B8F5E',
              height: '36px', 
              padding: '6px 16px' 
            }}
          >
            <UserCircle className="h-4 w-4" />
            Continue as guest
          </button>

          <p className="text-xs text-center" style={{ marginTop: '8px', color: '#8B7355' }}>
            Guest files are stored locally and will be lost when you close the tab
          </p>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError("");
              }}
              className="text-xs hover:underline"
              style={{ color: '#9B8F5E' }}
            >
              {isRegistering
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
