"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Code2,
  Plug,
  Share2,
  UserCircle,
  LayoutGrid,
  ArrowRight,
  LucideIcon,
} from "lucide-react";
import { useGuest } from "@/lib/guest-context";

const SLIDES = [
  "/landing/hero-erd.svg",
  "/landing/hero-dbml.svg",
  "/landing/hero-connect.svg",
];

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  image: string;
}

const FEATURES: Feature[] = [
  {
    icon: Database,
    title: "Visualize relationships",
    description:
      "See every table, column and foreign key on an interactive canvas. Auto-layout keeps even large schemas readable.",
    image: "/landing/feature-visualize.svg",
  },
  {
    icon: Code2,
    title: "Author in DBML",
    description:
      "Describe your database in clean, readable DBML and watch the diagram update live as you type.",
    image: "/landing/feature-dbml.svg",
  },
  {
    icon: Plug,
    title: "Import from PostgreSQL",
    description:
      "Drop in a connection string and DbViz reverse-engineers your live schema into an editable diagram.",
    image: "/landing/feature-connect.svg",
  },
  {
    icon: Share2,
    title: "Share & collaborate",
    description:
      "Publish a read-only link or invite teammates so everyone works from one source of truth.",
    image: "/landing/feature-share.svg",
  },
  {
    icon: LayoutGrid,
    title: "Export anywhere",
    description:
      "Export your model to SQL, DBML or an image with a single click — ready to drop into any workflow.",
    image: "/landing/feature-export.svg",
  },
  {
    icon: UserCircle,
    title: "No sign-up required",
    description:
      "Jump straight in as a guest. Your work stays in your browser until you choose to create an account.",
    image: "/landing/feature-guest.svg",
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), index * 90);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  return (
    <div
      ref={ref}
      className="gradient-card group overflow-hidden rounded-xl border transition-smooth"
      style={{
        borderColor: "var(--lp-border)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: "opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease, border-color 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--lp-primary)";
        e.currentTarget.style.boxShadow = "var(--glow-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--lp-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: "var(--lp-card-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={feature.image}
          alt={feature.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to top, var(--lp-card), transparent 55%)", opacity: 0.6 }}
        />
      </div>
      <div className="p-6">
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-smooth group-hover:scale-110"
          style={{ background: "var(--lp-primary-soft)" }}
        >
          <Icon className="h-6 w-6" style={{ color: "var(--lp-primary)" }} />
        </div>
        <h3 className="text-xl font-semibold transition-colors" style={{ color: "var(--lp-fg)" }}>
          {feature.title}
        </h3>
        <p className="mt-2 text-base leading-relaxed" style={{ color: "var(--lp-muted-fg)" }}>
          {feature.description}
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { setGuestMode } = useGuest();
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);

  const goTo = useCallback((i: number) => {
    setFading(true);
    setTimeout(() => {
      setCurrent(i);
      setFading(false);
    }, 400);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent((p) => (p + 1) % SLIDES.length);
        setFading(false);
      }, 400);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const handleTry = () => {
    setGuestMode(true);
    localStorage.removeItem("user");
    router.push("/dashboard");
  };
  const goLogin = () => router.push("/login");

  return (
    <div className="min-h-screen" style={{ background: "var(--lp-bg)", color: "var(--lp-fg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: "var(--lp-border)", background: "rgba(245,239,231,0.8)" }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--lp-primary)" }}>
              <Database className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">DbViz</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goLogin}
              className="rounded-md px-4 py-2 text-sm font-medium transition-smooth"
              style={{ color: "var(--lp-primary)", border: "1px solid var(--lp-primary)" }}
            >
              Log in
            </button>
            <button
              onClick={handleTry}
              className="glow-subtle inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-smooth hover:opacity-90"
              style={{ background: "var(--lp-primary)" }}
            >
              Try DbViz <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="gradient-hero relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-6 py-20">
        {/* Ambient glow blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-1/4 top-1/4 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "var(--lp-primary-softer)" }}
          />
          <div
            className="absolute -right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "var(--lp-primary-soft)" }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="flex flex-col items-center space-y-8 text-center">
            {/* Badge */}
            <span
              className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm"
              style={{ background: "rgba(251,247,240,0.6)", border: "1px solid var(--lp-primary-softer)", color: "var(--lp-muted-fg)" }}
            >
              <span className="lp-pulse mr-2 inline-block h-2 w-2 rounded-full" style={{ background: "var(--lp-primary)" }} />
              Database schema visualizer &amp; DBML editor
            </span>

            {/* Heading */}
            <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
              Visualize your database{" "}
              <span style={{ color: "var(--lp-primary)" }}>the way you think</span>{" "}
              about it
            </h1>

            {/* Subheading */}
            <p className="max-w-2xl text-xl leading-relaxed md:text-2xl" style={{ color: "var(--lp-muted-fg)" }}>
              Turn DBML or a live PostgreSQL connection into a clean, interactive ER diagram. Design, document and share your data model — no setup required.
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-4 pt-4 sm:flex-row">
              <button
                onClick={handleTry}
                className="glow-subtle group inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-base font-semibold text-white transition-smooth hover:opacity-90"
                style={{ background: "var(--lp-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--glow-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--glow-subtle)")}
              >
                Try DbViz free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-base font-semibold transition-smooth"
                style={{ background: "var(--lp-card)", color: "var(--lp-primary)", border: "1px solid var(--lp-primary-softer)" }}
              >
                <UserCircle className="h-5 w-5" />
                Log in
              </button>
            </div>

            {/* Hero carousel */}
            <div className="mt-16 w-full max-w-5xl">
              <div
                className="glow-subtle relative overflow-hidden rounded-2xl border transition-smooth"
                style={{ borderColor: "var(--lp-primary-softer)" }}
              >
                <div className="relative aspect-[16/10] w-full">
                  {SLIDES.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt={`DbViz interface view ${i + 1}`}
                      className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
                      style={{ opacity: i === current ? (fading ? 0 : 1) : 0 }}
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  ))}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "linear-gradient(to top, rgba(62,39,35,0.18), transparent 40%)" }}
                  />
                </div>

                {/* indicators */}
                <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
                  {SLIDES.map((src, i) => (
                    <button
                      key={src}
                      onClick={() => goTo(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className="h-2 rounded-full transition-all duration-300"
                      style={{
                        width: i === current ? 32 : 8,
                        background: i === current ? "var(--lp-primary)" : "rgba(155,143,94,0.35)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              Everything you need for{" "}
              <span style={{ color: "var(--lp-primary)" }}>intelligent</span> schema design
            </h2>
            <p className="mx-auto max-w-2xl text-xl" style={{ color: "var(--lp-muted-fg)" }}>
              Powerful features that make working with your data model effortless and intuitive.
            </p>
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="gradient-card glow-subtle relative overflow-hidden rounded-3xl border px-8 py-16 text-center" style={{ borderColor: "var(--lp-primary-softer)" }}>
            <div className="pointer-events-none absolute -right-1/4 -top-1/4 h-72 w-72 rounded-full blur-3xl" style={{ background: "var(--lp-primary-soft)" }} />
            <h2 className="relative text-4xl font-bold md:text-5xl">Ready to see your schema?</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-xl" style={{ color: "var(--lp-muted-fg)" }}>
              Jump straight in as a guest, or log in to save and share your diagrams.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={handleTry}
                className="group inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-base font-semibold text-white transition-smooth hover:opacity-90"
                style={{ background: "var(--lp-primary)" }}
              >
                Try DbViz free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                onClick={goLogin}
                className="inline-flex items-center justify-center rounded-lg px-8 py-3.5 text-base font-semibold transition-smooth"
                style={{ color: "var(--lp-primary)", border: "1px solid var(--lp-primary)" }}
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-12" style={{ borderColor: "var(--lp-border)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex flex-col items-center gap-2 md:items-start">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: "var(--lp-primary)" }}>
                  <Database className="h-4 w-4 text-white" />
                </span>
                <h3 className="text-xl font-bold" style={{ color: "var(--lp-primary)" }}>DbViz</h3>
              </div>
              <p className="text-sm" style={{ color: "var(--lp-muted-fg)" }}>
                Database schema visualizer &amp; DBML editor.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 md:items-end">
              <button onClick={handleTry} className="text-sm font-medium transition-smooth" style={{ color: "var(--lp-muted-fg)" }}>
                Try DbViz
              </button>
              <button onClick={goLogin} className="text-sm font-medium transition-smooth" style={{ color: "var(--lp-muted-fg)" }}>
                Log in
              </button>
            </div>
          </div>
          <div className="my-6 h-px w-full" style={{ background: "var(--lp-border)" }} />
          <div className="text-center text-sm" style={{ color: "var(--lp-muted-fg)" }}>
            © {new Date().getFullYear()} DbViz. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
