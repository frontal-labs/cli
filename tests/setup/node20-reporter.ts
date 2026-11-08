/**
 * Vitest's reporter uses `Map.groupBy`, which Node 20 lacks, so a failing test
 * crashes the reporter and hides the real error. CI runs the suite on Node 20
 * too. This runs in the main process (globalSetup), where the reporter lives.
 */
interface MapWithGroupBy {
  groupBy?: <K, V>(
    items: Iterable<V>,
    keyOf: (item: V, index: number) => K
  ) => Map<K, V[]>;
}

export default function setup(): void {
  const MapCtor = Map as unknown as MapWithGroupBy;
  if (typeof MapCtor.groupBy === "function") {
    return;
  }
  MapCtor.groupBy = <K, V>(
    items: Iterable<V>,
    keyOf: (item: V, index: number) => K
  ): Map<K, V[]> => {
    const groups = new Map<K, V[]>();
    let index = 0;
    for (const item of items) {
      const key = keyOf(item, index);
      index += 1;
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return groups;
  };
}
