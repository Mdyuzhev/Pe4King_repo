/**
 * Groups endpoints into a tree structure by tags or path prefixes.
 */

import { EndpointInfo } from '../core/models';

export interface EndpointNode {
  id: string;
  label: string;
  type: 'folder' | 'endpoint';
  checked: boolean;
  children?: EndpointNode[];
  endpoint?: EndpointInfo;
  method?: string;
  path?: string;
}

export class EndpointTreeBuilder {
  /**
   * Builds a tree structure from flat list of endpoints.
   * Groups by OpenAPI tags, falls back to path prefix.
   */
  build(endpoints: EndpointInfo[]): EndpointNode[] {
    const groups = this.groupEndpoints(endpoints);
    const tree: EndpointNode[] = [];

    for (const [groupName, groupEndpoints] of groups) {
      const children: EndpointNode[] = groupEndpoints.map((ep, idx) => ({
        id: `${groupName}-${idx}`,
        label: `${ep.method} ${ep.path}`,
        type: 'endpoint' as const,
        checked: true,
        endpoint: ep,
        method: ep.method,
        path: ep.path
      }));

      tree.push({
        id: groupName,
        label: `${this.formatGroupName(groupName)} (${children.length})`,
        type: 'folder',
        checked: true,
        children
      });
    }

    // Sort folders alphabetically
    tree.sort((a, b) => a.label.localeCompare(b.label));

    return tree;
  }

  /**
   * Groups endpoints by tag or path prefix.
   */
  private groupEndpoints(endpoints: EndpointInfo[]): Map<string, EndpointInfo[]> {
    const groups = new Map<string, EndpointInfo[]>();

    for (const endpoint of endpoints) {
      // Use first tag if available, otherwise extract from path
      const groupName = endpoint.tags?.[0] || this.extractPathGroup(endpoint.path);

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(endpoint);
    }

    // Sort endpoints within each group
    for (const [, eps] of groups) {
      eps.sort((a, b) => {
        // Sort by path, then by method
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return this.methodOrder(a.method) - this.methodOrder(b.method);
      });
    }

    return groups;
  }

  /**
   * Extracts group name from path (e.g., "/api/v2/projects/{id}" → "projects").
   */
  private extractPathGroup(path: string): string {
    const segments = path.split('/').filter(s => s && !s.startsWith('{'));

    // Skip "api" and version segments
    const meaningful = segments.filter(s =>
      !['api', 'v1', 'v2', 'v3'].includes(s.toLowerCase())
    );

    return meaningful[0] || 'other';
  }

  /**
   * Formats group name for display.
   */
  private formatGroupName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')  // camelCase → spaces
      .replace(/[-_]/g, ' ')       // kebab/snake → spaces
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Returns sort order for HTTP methods.
   */
  private methodOrder(method: string): number {
    const order: Record<string, number> = {
      'GET': 1,
      'POST': 2,
      'PUT': 3,
      'PATCH': 4,
      'DELETE': 5
    };
    return order[method] || 99;
  }
}
