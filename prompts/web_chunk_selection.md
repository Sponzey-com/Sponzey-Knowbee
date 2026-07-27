# Web Chunk Selection

## Responsibility

Select the bounded document chunks that best support the required facts.

## Rules

- Evaluate only chunks in the supplied snapshot.
- Select one to the supplied ceiling.
- Do not copy chunk content into the receipt.
- Do not create claims, resolve conflicts, or draft an answer.
- Return only the JSON shape defined by the operation instruction.
