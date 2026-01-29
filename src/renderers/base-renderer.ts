/**
 * Abstract base class for test renderers.
 */

import { TestModel, GeneratedFile } from '../core/models';

export abstract class BaseRenderer {
  abstract get name(): string;
  abstract get fileExtension(): string;
  abstract render(model: TestModel): GeneratedFile[];
}
