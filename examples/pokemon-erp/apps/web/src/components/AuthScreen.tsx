import { useState, type FormEvent } from "react";
import { authClient } from "../auth-client";

export function AuthScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: String(form.get("name")),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });
    if (result.error) setError(result.error.message ?? "Authentication failed");
    else window.location.reload();
  }

  return (
    <main>
      <h1>Pokémon Supplies Factory ERP</h1>
      <form onSubmit={submit}>
        {mode === "sign-up" ? (
          <label>
            Name
            <input name="name" required />
          </label>
        ) : null}
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} required />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">{mode === "sign-up" ? "Create account" : "Sign in"}</button>
      </form>
      <button
        type="button"
        onClick={() => setMode((value) => (value === "sign-in" ? "sign-up" : "sign-in"))}
      >
        {mode === "sign-in" ? "Create an account" : "Use an existing account"}
      </button>
    </main>
  );
}
