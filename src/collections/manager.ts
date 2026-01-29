/**
 * Collection Manager - handles persistence and CRUD operations.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  Collection,
  CollectionFolder,
  SavedRequest,
  CollectionsData,
  RequestScripts,
  TestSnippet,
  VariableExtraction,
  createCollection as makeCollection,
  createFolder as makeFolder,
  createSavedRequest as makeSavedRequest,
  generateId
} from './models';

const COLLECTIONS_FILE = 'pe4king-collections.json';
const COLLECTIONS_VERSION = '1.0.0';

export class CollectionManager {
  private _data: CollectionsData;
  private _storagePath: string;
  private _onDidChange = new vscode.EventEmitter<void>();

  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    // Use globalStorageUri if available, fallback to globalStoragePath (deprecated) or workspace
    let storagePath: string;
    if (context.globalStorageUri) {
      storagePath = context.globalStorageUri.fsPath;
    } else if ((context as unknown as { globalStoragePath?: string }).globalStoragePath) {
      storagePath = (context as unknown as { globalStoragePath: string }).globalStoragePath;
    } else {
      // Fallback to workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      storagePath = workspaceFolder ? path.join(workspaceFolder, '.pe4king') : path.join(process.cwd(), '.pe4king');
    }

    this._storagePath = path.join(storagePath, COLLECTIONS_FILE);
    console.log('[Collections] Storage path:', this._storagePath);
    this._data = this.load();
    console.log('[Collections] Loaded', this._data.collections.length, 'collections');
  }

  /**
   * Get all collections.
   */
  get collections(): Collection[] {
    return this._data.collections;
  }

  /**
   * Load collections from storage.
   */
  private load(): CollectionsData {
    try {
      // Ensure storage directory exists
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this._storagePath)) {
        const content = fs.readFileSync(this._storagePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('[Collections] Failed to load:', error);
    }

    return { version: COLLECTIONS_VERSION, collections: [] };
  }

  /**
   * Save collections to storage.
   */
  private save(): void {
    try {
      const dir = path.dirname(this._storagePath);
      console.log('[Collections] Saving to:', this._storagePath);
      if (!fs.existsSync(dir)) {
        console.log('[Collections] Creating directory:', dir);
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._storagePath, JSON.stringify(this._data, null, 2));
      console.log('[Collections] Saved', this._data.collections.length, 'collections');
      this._onDidChange.fire();
    } catch (error) {
      console.error('[Collections] Failed to save:', error);
      vscode.window.showErrorMessage(`Failed to save collections: ${error}`);
    }
  }

  // ========== Collection Operations ==========

  /**
   * Create new collection.
   */
  createCollection(name: string, description?: string): Collection {
    const collection = makeCollection(name, description);
    this._data.collections.push(collection);
    this.save();
    return collection;
  }

  /**
   * Get collection by ID.
   */
  getCollection(collectionId: string): Collection | undefined {
    return this._data.collections.find(c => c.id === collectionId);
  }

  /**
   * Update collection.
   */
  updateCollection(collectionId: string, updates: Partial<Pick<Collection, 'name' | 'description'>>): void {
    const collection = this.getCollection(collectionId);
    if (collection) {
      Object.assign(collection, updates, { updatedAt: new Date().toISOString() });
      this.save();
    }
  }

  /**
   * Delete collection.
   */
  deleteCollection(collectionId: string): void {
    const index = this._data.collections.findIndex(c => c.id === collectionId);
    if (index !== -1) {
      this._data.collections.splice(index, 1);
      this.save();
    }
  }

  // ========== Folder Operations ==========

  /**
   * Create folder in collection or parent folder.
   */
  createFolderIn(collectionId: string, name: string, parentFolderId?: string): CollectionFolder | undefined {
    const collection = this.getCollection(collectionId);
    if (!collection) return undefined;

    const folder = makeFolder(name);

    if (parentFolderId) {
      const parent = this.findFolder(collection, parentFolderId);
      if (parent) {
        parent.folders.push(folder);
      } else {
        return undefined;
      }
    } else {
      collection.folders.push(folder);
    }

    collection.updatedAt = new Date().toISOString();
    this.save();
    return folder;
  }

  /**
   * Find folder recursively.
   */
  private findFolder(collection: Collection, folderId: string): CollectionFolder | undefined {
    const searchFolders = (folders: CollectionFolder[]): CollectionFolder | undefined => {
      for (const folder of folders) {
        if (folder.id === folderId) return folder;
        const found = searchFolders(folder.folders);
        if (found) return found;
      }
      return undefined;
    };

    return searchFolders(collection.folders);
  }

  /**
   * Delete folder.
   */
  deleteFolder(collectionId: string, folderId: string): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const deleteFolderRecursive = (folders: CollectionFolder[]): boolean => {
      const index = folders.findIndex(f => f.id === folderId);
      if (index !== -1) {
        folders.splice(index, 1);
        return true;
      }
      for (const folder of folders) {
        if (deleteFolderRecursive(folder.folders)) return true;
      }
      return false;
    };

    if (deleteFolderRecursive(collection.folders)) {
      collection.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Rename folder.
   */
  renameFolder(collectionId: string, folderId: string, newName: string): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const folder = this.findFolder(collection, folderId);
    if (folder) {
      folder.name = newName;
      collection.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  // ========== Request Operations ==========

  /**
   * Save request to collection or folder.
   */
  saveRequest(
    collectionId: string,
    name: string,
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
    bodyType?: SavedRequest['bodyType'],
    folderId?: string,
    scripts?: RequestScripts
  ): SavedRequest | undefined {
    const collection = this.getCollection(collectionId);
    if (!collection) return undefined;

    const request = makeSavedRequest(name, method, url, headers, body, bodyType, scripts);

    if (folderId) {
      const folder = this.findFolder(collection, folderId);
      if (folder) {
        folder.requests.push(request);
      } else {
        return undefined;
      }
    } else {
      collection.requests.push(request);
    }

    collection.updatedAt = new Date().toISOString();
    this.save();
    return request;
  }

  /**
   * Update existing request.
   */
  updateRequest(
    collectionId: string,
    requestId: string,
    updates: Partial<Omit<SavedRequest, 'id' | 'createdAt'>>
  ): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (request) {
      Object.assign(request, updates, { updatedAt: new Date().toISOString() });
      collection.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Find request recursively.
   */
  private findRequest(collection: Collection, requestId: string): SavedRequest | undefined {
    // Check root requests
    const rootRequest = collection.requests.find(r => r.id === requestId);
    if (rootRequest) return rootRequest;

    // Search in folders
    const searchFolders = (folders: CollectionFolder[]): SavedRequest | undefined => {
      for (const folder of folders) {
        const request = folder.requests.find(r => r.id === requestId);
        if (request) return request;
        const found = searchFolders(folder.folders);
        if (found) return found;
      }
      return undefined;
    };

    return searchFolders(collection.folders);
  }

  /**
   * Delete request.
   */
  deleteRequest(collectionId: string, requestId: string): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    // Check root requests
    const rootIndex = collection.requests.findIndex(r => r.id === requestId);
    if (rootIndex !== -1) {
      collection.requests.splice(rootIndex, 1);
      collection.updatedAt = new Date().toISOString();
      this.save();
      return;
    }

    // Search in folders
    const deleteFromFolders = (folders: CollectionFolder[]): boolean => {
      for (const folder of folders) {
        const index = folder.requests.findIndex(r => r.id === requestId);
        if (index !== -1) {
          folder.requests.splice(index, 1);
          return true;
        }
        if (deleteFromFolders(folder.folders)) return true;
      }
      return false;
    };

    if (deleteFromFolders(collection.folders)) {
      collection.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Get request by ID.
   */
  getRequest(collectionId: string, requestId: string): SavedRequest | undefined {
    const collection = this.getCollection(collectionId);
    if (!collection) return undefined;
    return this.findRequest(collection, requestId);
  }

  /**
   * Export collection to Postman format.
   */
  exportToPostman(collectionId: string): object | undefined {
    const collection = this.getCollection(collectionId);
    if (!collection) return undefined;

    const convertRequest = (req: SavedRequest) => ({
      name: req.name,
      request: {
        method: req.method,
        header: Object.entries(req.headers).map(([key, value]) => ({ key, value })),
        url: { raw: req.url },
        body: req.body ? {
          mode: req.bodyType === 'raw' ? 'raw' : 'urlencoded',
          raw: req.body
        } : undefined
      }
    });

    const convertFolder = (folder: CollectionFolder): object => ({
      name: folder.name,
      item: [
        ...folder.requests.map(convertRequest),
        ...folder.folders.map(convertFolder)
      ]
    });

    return {
      info: {
        name: collection.name,
        description: collection.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [
        ...collection.requests.map(convertRequest),
        ...collection.folders.map(convertFolder)
      ]
    };
  }

  /**
   * Get tree structure for UI.
   */
  getTreeData(): CollectionTreeNode[] {
    return this._data.collections.map(c => this.collectionToTreeNode(c));
  }

  private collectionToTreeNode(collection: Collection): CollectionTreeNode {
    return {
      id: collection.id,
      type: 'collection',
      name: collection.name,
      children: [
        ...collection.requests.map(r => this.requestToTreeNode(r, collection.id)),
        ...collection.folders.map(f => this.folderToTreeNode(f, collection.id))
      ]
    };
  }

  private folderToTreeNode(folder: CollectionFolder, collectionId: string): CollectionTreeNode {
    return {
      id: folder.id,
      type: 'folder',
      name: folder.name,
      collectionId,
      children: [
        ...folder.requests.map(r => this.requestToTreeNode(r, collectionId)),
        ...folder.folders.map(f => this.folderToTreeNode(f, collectionId))
      ]
    };
  }

  private requestToTreeNode(request: SavedRequest, collectionId: string): CollectionTreeNode {
    return {
      id: request.id,
      type: 'request',
      name: request.name,
      collectionId,
      method: request.method,
      url: request.url,
      tests: request.tests
    };
  }

  // ========== Test Snippet Operations ==========

  /**
   * Add test snippet to request.
   */
  addTestToRequest(collectionId: string, requestId: string, snippet: TestSnippet): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request) return;

    if (!request.tests) {
      request.tests = [];
    }

    request.tests.push(snippet);
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Remove test snippet from request.
   */
  removeTestFromRequest(collectionId: string, requestId: string, index: number): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request || !request.tests) return;

    request.tests.splice(index, 1);
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Update test snippet.
   */
  updateTest(collectionId: string, requestId: string, index: number, updates: Partial<TestSnippet>): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request || !request.tests || !request.tests[index]) return;

    request.tests[index] = { ...request.tests[index], ...updates };
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Toggle test enabled/disabled.
   */
  toggleTest(collectionId: string, requestId: string, index: number): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request || !request.tests || !request.tests[index]) return;

    request.tests[index].enabled = !request.tests[index].enabled;
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Get all tests for a request.
   */
  getRequestTests(collectionId: string, requestId: string): TestSnippet[] {
    const collection = this.getCollection(collectionId);
    if (!collection) return [];

    const request = this.findRequest(collection, requestId);
    return request?.tests || [];
  }

  /**
   * Replace all tests for a request.
   */
  updateRequestTests(collectionId: string, requestId: string, tests: TestSnippet[]): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request) return;

    request.tests = tests;
    request.updatedAt = new Date().toISOString();
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  // ========== Variable Extraction Methods ==========

  /**
   * Add variable extraction to request.
   */
  addExtractionToRequest(collectionId: string, requestId: string, extraction: VariableExtraction): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request) return;

    if (!request.extractVariables) {
      request.extractVariables = [];
    }

    request.extractVariables.push(extraction);
    request.updatedAt = new Date().toISOString();
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Remove variable extraction from request.
   */
  removeExtractionFromRequest(collectionId: string, requestId: string, index: number): void {
    const collection = this.getCollection(collectionId);
    if (!collection) return;

    const request = this.findRequest(collection, requestId);
    if (!request || !request.extractVariables) return;

    request.extractVariables.splice(index, 1);
    request.updatedAt = new Date().toISOString();
    collection.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Get all extractions for a request.
   */
  getRequestExtractions(collectionId: string, requestId: string): VariableExtraction[] {
    const collection = this.getCollection(collectionId);
    if (!collection) return [];

    const request = this.findRequest(collection, requestId);
    return request?.extractVariables || [];
  }
}

export interface CollectionTreeNode {
  id: string;
  type: 'collection' | 'folder' | 'request';
  name: string;
  collectionId?: string;
  method?: string;
  url?: string;
  tests?: TestSnippet[];
  children?: CollectionTreeNode[];
}
