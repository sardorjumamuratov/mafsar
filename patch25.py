import re

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

prompt_old = '''const BOTTLENECK_TASK_PROMPT = You write a "find the bottleneck" system design exercise.
You get a topic and the learner's study cards. Describe a small, realistic architecture with traffic
numbers and ONE planted flaw drawn from those concepts (a single write primary under global writes,
retries without idempotency, a hot partition key, a synchronous chain on a slow dependency, a cache
with no invalidation...). Don't hint at the flaw in the description.

Respond with ONLY valid JSON:
{
  "narrative": string,                 // 2-4 sentences: what the system does, the traffic
  "architecture": [string],            // components in request order, e.g. "API servers (3x)"
  "planted_flaw": string,
  "why_it_fails": string,
  "model_solution": string             // a good fix and its trade-off
};'''

prompt_new = '''const BOTTLENECK_TASK_PROMPT = You write a "find the bottleneck" system design exercise.
You get a topic and the learner's study cards. Describe a small, realistic architecture with traffic
numbers and ONE planted flaw drawn from those concepts (a single write primary under global writes,
retries without idempotency, a hot partition key, a synchronous chain on a slow dependency, a cache
with no invalidation...). Don't hint at the flaw in the description.

Respond with ONLY valid JSON:
{
  "narrative": string,
  "components": [{ "id": string, "name": string, "detail": string }], // the architecture components in request order. id must be a unique slug
  "flaw_component": string,            // the id of the component where the planted flaw lives
  "planted_flaw": string,
  "why_it_fails": string,
  "model_solution": string,            // a good fix
  "tradeoff": string                   // the fix's trade-off
};'''

code = code.replace(prompt_old, prompt_new)

gen_old = '''export async function generateBottleneckTask(concept: string, reference: Ref[], uid?: string, practiceStyle?: string) {
  const parsed = await callJson(BOTTLENECK_TASK_PROMPT, Topic: \\n\\nStudy cards:\\n);
  const narrative = str(parsed?.narrative, 1200);
  const architecture = strList(parsed?.architecture, 12, 120);
  const planted_flaw = str(parsed?.planted_flaw, 600);
  if (!narrative || architecture.length < 2 || !planted_flaw) {
    throw new LLMError("The model didn't return a usable scenario. Try again.");
  }
  const secret = {
    narrative,
    architecture,
    planted_flaw,
    why_it_fails: str(parsed?.why_it_fails, 800),
    model_solution: str(parsed?.model_solution, 1200),
  };
  return { narrative, architecture, state: encryptState({ ...secret, uid, iat: Date.now(), practiceStyle }) };
}'''

gen_new = '''export async function generateBottleneckTask(concept: string, reference: Ref[], uid?: string, practiceStyle?: string) {
  const parsed = await callJson(BOTTLENECK_TASK_PROMPT, Topic: \\n\\nStudy cards:\\n);
  const narrative = str(parsed?.narrative, 1200);
  const components = (Array.isArray(parsed?.components) ? parsed.components : []).map((c: any) => ({
    id: str(c?.id, 100),
    name: str(c?.name, 200),
    detail: str(c?.detail, 500)
  })).filter((c: any) => c.id && c.name);
  const planted_flaw = str(parsed?.planted_flaw, 600);
  if (!narrative || components.length < 2 || !planted_flaw) {
    throw new LLMError("The model didn't return a usable scenario. Try again.");
  }
  const secret = {
    narrative,
    components,
    flaw_component_id: str(parsed?.flaw_component, 100),
    tradeoff: str(parsed?.tradeoff, 800),
    hints: [],
    hintLevel: 0,
    planted_flaw,
    why_it_fails: str(parsed?.why_it_fails, 800),
    model_solution: str(parsed?.model_solution, 1200),
  };
  return { narrative, components, state: encryptState({ ...secret, uid, iat: Date.now(), practiceStyle }) };
}'''

code = code.replace(gen_old, gen_new)

code = code.replace(
    'type BottleneckState = { narrative: string; architecture: string[]; planted_flaw: string; why_it_fails: string; model_solution: string; hintUsed?: boolean; uid?: string; iat?: number; practiceStyle?: string };',
    'type BottleneckState = { narrative: string; components: {id: string, name: string, detail: string}[]; flaw_component_id: string; tradeoff: string; hints: string[]; hintLevel: number; planted_flaw: string; why_it_fails: string; model_solution: string; hintUsed?: boolean; uid?: string; iat?: number; practiceStyle?: string };'
)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
