1. **Contextual Triggers**

- Buttons appear/disappear based on conversation state:
  - `hasConflictingClaims`: Shows comparison tools
  - `hasEvidenceCited`: Shows evidence analysis options
  - `hasMultipleThreads`: Shows thread management tools
  - `threadDepth`: Shows focus/summary tools for deep threads
  - `timeElapsed`: Shows temporal analysis tools
  - `detectedConcepts`: Shows concept mapping tools

2. **Visual Grouping**

- Actions are grouped by type and relevance:
  - Primary actions (always visible but contextually styled)
  - Dynamic suggestions (based on recent activity)
  - Concept-based actions
  - Time-based suggestions
  - Thread-based actions

3. **Progressive Disclosure**

- More specialized tools appear as the conversation develops
- Less commonly needed actions start as ghost buttons
- Critical actions get more prominent styling

4. **Semantic Coloring**

- Evidence-related: Green tones
- Conflict-related: Amber tones
- Thread-related: Blue tones
- Concept-related: Purple tones
- Temporal: Gray tones

To implement this with your existing graph structure:

```typescript
interface ConversationContext {
    hasConflictingClaims: boolean;
    hasEvidenceCited: boolean;
    hasMultipleThreads: boolean;
    recentActivity: "evidence" | "claim" | "counter" | "support";
    detectedConcepts: string[];
    threadDepth: number;
    timeElapsed: number;
}

// Graph analysis to detect context
const analyzeGraphContext = (graph: ArgumentGraph): ConversationContext => {
    return {
        hasConflictingClaims: detectConflicts(graph),
        hasEvidenceCited: detectEvidence(graph),
        hasMultipleThreads: detectThreads(graph),
        recentActivity: getRecentActivityType(graph),
        detectedConcepts: extractConcepts(graph),
        threadDepth: calculateMaxDepth(graph),
        timeElapsed: calculateTimespan(graph),
    };
};
```

Would you like me to:

1. Detail the implementation of any specific context detection functions?
2. Show how these buttons could trigger graph transformations?
3. Explore other types of contextual actions?
