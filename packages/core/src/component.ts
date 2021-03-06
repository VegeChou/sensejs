import {decorate, injectable} from 'inversify';
import {Class, ComponentMetadata, ComponentScope, Constructor} from './interfaces';

const COMPONENT_METADATA_KEY = Symbol('ComponentSpec');

export interface ComponentOption<T extends {} = {}> {
  scope?: ComponentScope;
  id?: string | symbol | Class<T>;
  name?: string | symbol;
  tags?: {
    key: string | number | symbol;
    value: unknown;
  }[];
}

export function getComponentMetadata<T extends {}>(target: Class<T>): ComponentMetadata<T> {
  const result: ComponentMetadata<T> = Reflect.getMetadata(COMPONENT_METADATA_KEY, target);
  if (!result) {
    throw new Error('Target is not an component');
  }
  return result;
}

export function setComponentMetadata<T extends {}>(target: Constructor<T>, option: ComponentOption<T>) {
  if (Reflect.hasOwnMetadata(COMPONENT_METADATA_KEY, target)) {
    throw new Error('Component metadata already defined for target');
  }
  const {
    tags = [],
    name,
    id = target,
    scope = ComponentScope.TRANSIENT,
  } = option;
  const metadata: ComponentMetadata<T> = {
    target,
    id,
    scope,
    name,
    tags,
  };

  Reflect.defineMetadata(COMPONENT_METADATA_KEY, metadata, target);
}

/**
 * Component decorator
 * @param option
 * @decorator
 */
export function Component(option: ComponentOption = {}) {
  return (target: Constructor) => {
    decorate(injectable(), target);
    if (typeof option.id === 'function') {
      if (!(target.prototype instanceof option.id) && option.id !== target) {
        throw new Error('Explicitly specified component id must be string, symbol, or any of its base class');
      }
    }
    setComponentMetadata(target, option);
  };
}
