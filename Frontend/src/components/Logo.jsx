import React from "react";

export default function AgnikavachLogo({ size = "large" }) {
  const fontSize = size === "large" ? "clamp(3rem, 12vw, 10rem)" : "2.5rem";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      userSelect: "none",
      textAlign: "center"
    }}>
      {/* Tagline with Enhanced Warm Glow */}
      <span style={{
        fontFamily: "monospace",
        fontSize: "clamp(0.65rem, 1.2vw, 1rem)",
        letterSpacing: "0.35em",
        color: "#fff",
        textTransform: "uppercase",
        marginBottom: "10px",
      }}>
        Global Thermal Intelligence
      </span>

      {/* Main Logo Text in Pure White with Powerful Yellowish-Orange Glow */}
      <div style={{
        fontFamily: "'Baumans', cursive",
        fontSize: fontSize,
        fontWeight: 400,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        whiteSpace: "nowrap",
        letterSpacing: "-0.02em",
        lineHeight: 0.85,
        textTransform: "uppercase",
        userSelect: "none",
      }}>
        <span>AGNIKAVACH</span>
      </div>
    </div>
  );
}