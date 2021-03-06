import {ServiceIdentifier} from './interfaces';
import {decorate, inject, named, optional, tagged} from 'inversify';
import {ConstructorParamDecorator, DecoratorBuilder, MethodParamDecorator, ParamDecorator} from '@sensejs/utility';
import {makeDeprecateMessageEmitter} from './utils';
import {ensureMethodInjectMetadata, MethodInject, MethodParameterInjectOption} from './method-inject';
import {decorateInjectedConstructorParam} from './constructor-inject';

function applyToParamBindingInvoker<Parameter>(
  decorator: ParameterDecorator,
  prototype: {},
  name: string | symbol,
  index: number,
) {
  const targetMethod = Reflect.get(prototype, name);
  if (typeof targetMethod === 'function') {
    const metadata = ensureMethodInjectMetadata(targetMethod);
    decorate(decorator, metadata.proxy, index);
  }
}

export function Inject<T>(target: ServiceIdentifier<T>, option?: MethodParameterInjectOption<T, any>) {
  const name = typeof target === 'function' ? target.name : target.toString();
  return new DecoratorBuilder(`Inject(${name})`).whenApplyToInstanceMethodParam(
    (prototype, name, index) => {
      return MethodInject(target, option)(prototype, name, index);
    },
  ).whenApplyToConstructorParam((constructor, index) => {
    decorateInjectedConstructorParam(constructor, index, option?.transform);
    return decorate(inject(target) as ParameterDecorator, constructor, index);
  }).build<ParamDecorator>();
}

export function Optional() {
  // XXX: Inversify Typing Error?
  // Need to use @optional() instead of @optional
  const decorator = optional() as ParameterDecorator;
  return new DecoratorBuilder('Optional')
    .whenApplyToInstanceMethodParam((prototype: {}, name: string | symbol, index: number) => {
      return applyToParamBindingInvoker(decorator, prototype, name, index);
    })
    .whenApplyToConstructorParam((constructor, index) => {
      return decorate(decorator, constructor, index);
    })
    .build<ParamDecorator>();
}

export interface InjectionConstraintDecorator
  extends ConstructorParamDecorator, MethodParamDecorator {
}

export function Tagged(key: string | number | symbol, value: any) {
  const decorator = tagged(key, value) as ParameterDecorator;
  return new DecoratorBuilder(`Tagged(key=${String(key)}, value=${String(value)})`)
    .whenApplyToInstanceMethodParam((prototype: {}, name: string | symbol, index: number) => {
      return applyToParamBindingInvoker(decorator, prototype, name, index);
    })
    .whenApplyToConstructorParam((constructor, index) => {
      return decorate(decorator, constructor, index);
    })
    .build<InjectionConstraintDecorator>();
}

export function Named(name: string | symbol) {
  const decorator = named(name) as ParameterDecorator;
  return new DecoratorBuilder(`Named(name="${name.toString()}")`)
    .whenApplyToInstanceMethodParam((prototype: {}, name: string | symbol, index: number) => {
      return applyToParamBindingInvoker(decorator, prototype, name, index);
    })
    .whenApplyToConstructorParam((constructor, index) => {
      return decorate(decorator, constructor, index);
    })
    .build<InjectionConstraintDecorator>();
}

const deprecatedMessageEmitter = makeDeprecateMessageEmitter(ParamBinding, Inject);

/**
 * @param target Identifier of target wanted to be injected
 * @param option
 * @decorator
 * @deprecated
 * @see Inject
 */
export function ParamBinding<T, R = T>(target: ServiceIdentifier<T>, option: MethodParameterInjectOption<T, R> = {}) {
  deprecatedMessageEmitter();
  return MethodInject(target, option);
}
