import {Constructor, ServiceIdentifier} from './interfaces';
import {Container, decorate, inject, injectable} from 'inversify';



export interface Transformer<Input = any, Output = Input> {
    (input: Input): Output
}

export interface ParamBindingOption {
    transform?: Transformer
}

interface ParamBindingMetadata {
    target: ServiceIdentifier<unknown>;
    transform: Transformer
}

interface FunctionParamBindingMetadata {
    paramsMetadata: ParamBindingMetadata[];
    invoker: Constructor<Invokable>;
}

export class ParamBindingError extends Error {

}

interface Invokable {
    call(paramsBindingMetadata: ParamBindingMetadata[], self: any): any;
}

const ParamBindingKey = Symbol('ParamBindingKey');

export function ensureParamBindingMetadata(target: Function): FunctionParamBindingMetadata {
    if (target[ParamBindingKey]) {
        return target[ParamBindingKey];
    }

    @injectable()
    class Invoker implements Invokable {
        private readonly args: unknown[];

        constructor(...args: unknown[]) {
            this.args = args;

        }

        call(paramsBindingMetadata: ParamBindingMetadata[], self: any) {
            return target.apply(self, this.args.map((elem, idx) => paramsBindingMetadata[idx].transform(elem)));
        }
    }
    const paramBindingMetadata = {
        paramsMetadata: [],
        invoker: Invoker
    };

    Reflect.set(target, ParamBindingKey, paramBindingMetadata);
    return paramBindingMetadata;
}


export function ParamBinding(target: ServiceIdentifier<unknown>, option: ParamBindingOption = {}) {
    return function (prototype, methodName, paramIndex) {
        const metadata = ensureParamBindingMetadata(prototype[methodName]);
        if (metadata.paramsMetadata[paramIndex]) {
            throw new ParamBindingError();
        }
        // XXX: Why return value of inject() cannot be converted to ParameterDecorator?
        const parameterDecorator = inject(target) as ParameterDecorator;
        decorate(parameterDecorator, metadata.invoker as Constructor<unknown>, paramIndex);

        metadata.paramsMetadata[paramIndex] = Object.assign({target}, {transform: option.transform ? option.transform : x => x});
    };
}

export function getFunctionParamBindingMetadata(method: Function): FunctionParamBindingMetadata {
    return Reflect.get(method, ParamBindingKey);
}

export class ParamBindingResolvingError extends Error {

}

function resolveInvoker(container: Container, invokerConstructor: Constructor<Invokable>) {
    try {
        return container.resolve<Invokable>(invokerConstructor);
    } catch (e) {
        throw new ParamBindingResolvingError();
    }
}

export function invokeMethod<T>(container: Container, target: T, method: (this: T, ...args: any[]) => unknown) {
    const metadata = getFunctionParamBindingMetadata(method);
    if (!metadata) {
        throw new ParamBindingResolvingError();
    }

    if (metadata.paramsMetadata.length != method.length) {
        throw new ParamBindingResolvingError();
    }
    let invoker = resolveInvoker(container, metadata.invoker);

    return invoker.call(metadata.paramsMetadata, target);
}

