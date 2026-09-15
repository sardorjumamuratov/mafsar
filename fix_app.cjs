const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8").replace(/\r\n/g, "\n");
content = content.replace(
  `    if (e.name === "LLMError") {
      console.error("LLM:", e.message);
      return c.json({ error: "llm_error", message: e.message }, (e.status ?? 502) as 502);
    }
    console.error(err);
    return c.json({ error: "internal" }, 500);`,
  `    const where = { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined };
    if (e.name === "LLMError") {
      console.error("LLM:", e.message);
      const status = (e.status ?? 502) as 502;
      reportError(err, { ...where, level: "warning", status });
      return c.json({ error: "llm_error", message: e.message }, status);
    }
    console.error(err);
    reportError(err, { ...where, status: 500 });
    return c.json({ error: "internal" }, 500);`
);

content = content.replace(
  `      console.error("Checkout error:", e.stack);`,
  `      console.error("Checkout error:", e.stack);\n      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });`
);
content = content.replace(
  `      console.error("Portal error:", e.stack);`,
  `      console.error("Portal error:", e.stack);\n      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });`
);

content = content.replace(
  `    } catch (e: any) {
      console.error(e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });

  // Stripe webhooks`,
  `    } catch (e: any) {
      console.error(e.stack);
      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });
      return c.json({ error: "internal" }, 500);
    }
  });

  // Stripe webhooks`
);

content = content.replace(
  `    } catch (e: any) {
      console.error(e.stack);
      return c.json({ error: "internal" }, 500);
    }
  });

  return app;`,
  `    } catch (e: any) {
      console.error(e.stack);
      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });
      return c.json({ error: "internal" }, 500);
    }
  });

  return app;`
);

fs.writeFileSync("server/src/app.ts", content);
