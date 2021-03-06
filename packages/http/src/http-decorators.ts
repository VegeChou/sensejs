import {Transformer} from '@sensejs/utility';
import {Component, Constructor, Inject, validateMethodInjectMetadata} from '@sensejs/core';
import {HttpContext, HttpInterceptor} from './http-abstract';

export enum HttpMethod {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
  PATCH = 'patch',
}

export interface RequestMappingMetadata {
  interceptors: Constructor<HttpInterceptor>[];
  httpMethod: HttpMethod;
  path: string;
}

export interface RequestMappingOption {
  interceptors?: Constructor<HttpInterceptor>[];
}

export interface ControllerMetadata {
  path: string;
  target: Constructor;
  prototype: object;
  interceptors: Constructor<HttpInterceptor>[];
  labels: Set<string | symbol>;
}

export interface ControllerOption {
  /**
   *
   */
  interceptors?: Constructor<HttpInterceptor>[];

  /**
   * Label of controller
   *
   * @see HttpModuleOption
   * @deprecated
   */
  label?: (string | symbol)[] | Set<symbol | string>;
  /**
   * Label of controller
   *
   * @see HttpModuleOption
   */
  labels?: (string | symbol)[] | Set<symbol | string>;
}

const noop: Transformer = (x) => x;

export function Path(name: string, transform: Transformer = noop) {
  return Inject(HttpContext, {
    transform: (ctx: HttpContext) => transform(ctx.request.params[name]),
  });
}

export function Body(transform: Transformer = noop) {
  return Inject(HttpContext, {
    transform: (ctx: HttpContext) => transform(ctx.request.body),
  });
}

export function Query(transform: Transformer = noop) {
  return Inject(HttpContext, {
    transform: (ctx: HttpContext) => transform(ctx.request.query),
  });
}

export function Header(name: string, transform: Transformer = noop) {
  name = name.toLowerCase();
  return Inject(HttpContext, {
    transform: (ctx: HttpContext) => transform(ctx.request.headers[name]),
  });
}

export interface HttpRequestBuiltinParam {
  body: unknown;
  query: unknown;
  path: {
    [key: string]: string;
  };
  header: {
    [key: string]: string;
  };
}

const RequestMappingMetadataKey = Symbol('RequestMappingMetadataKey');

function setRequestMappingMetadata(targetMethod: object, requestMappingMetadata: RequestMappingMetadata) {
  if (Reflect.getMetadata(RequestMappingMetadataKey, targetMethod)) {
    throw new Error('target method is already decorated with RequestMapping');
  }
  Reflect.defineMetadata(RequestMappingMetadataKey, requestMappingMetadata, targetMethod);
}

export function getRequestMappingMetadata(targetMethod: object): RequestMappingMetadata | undefined {
  return Reflect.getMetadata(RequestMappingMetadataKey, targetMethod);
}

/**
 * RequestMapping decorator, mapping HTTP request into target method
 *
 * @param httpMethod
 * @param path
 * @param option
 * @decorator
 */
export function RequestMapping(httpMethod: HttpMethod, path: string, option: RequestMappingOption = {}) {
  return <T extends {}>(prototype: T, method: keyof T & string) => {
    const targetMethod = prototype[method];
    if (typeof targetMethod !== 'function') {
      throw new Error('Request mapping decorator must be applied to a function');
    }
    validateMethodInjectMetadata(targetMethod);
    setRequestMappingMetadata(targetMethod, {
      httpMethod,
      path,
      interceptors: option.interceptors || [],
    });
  };
}

/**
 * HTTP request mapping shortcut for get method
 * @param path
 * @param option
 * @decorator
 */
export function GET(path: string, option?: RequestMappingOption) {
  return RequestMapping(HttpMethod.GET, path, option);
}

/**
 * HTTP request mapping shortcut for post method
 * @param path
 * @param option
 * @decorator
 */
export function POST(path: string, option?: RequestMappingOption) {
  return RequestMapping(HttpMethod.POST, path, option);
}

/**
 * HTTP request mapping shortcut for patch method
 * @param path
 * @param option
 * @decorator
 */
export function PATCH(path: string, option?: RequestMappingOption) {
  return RequestMapping(HttpMethod.PATCH, path, option);
}

/**
 * HTTP request mapping shortcut for delete method
 * @param path
 * @param option
 * @decorator
 */
export function DELETE(path: string, option?: RequestMappingOption) {
  return RequestMapping(HttpMethod.DELETE, path, option);
}

/**
 * HTTP request mapping shortcut for put method
 * @param path
 * @param option
 * @decorator
 */
export function PUT(path: string, option?: RequestMappingOption) {
  return RequestMapping(HttpMethod.PUT, path, option);
}

const ControllerMetadataKey = Symbol('ControllerMetadataKey');

function setHttpControllerMetadata(target: Constructor, controllerMetadata: ControllerMetadata) {
  if (Reflect.getMetadata(ControllerMetadataKey, target)) {
    throw new Error('Target constructor is already has controller metadata');
  }
  Reflect.defineMetadata(ControllerMetadataKey, controllerMetadata, target);
}

export function getHttpControllerMetadata(target: object): ControllerMetadata | undefined {
  return Reflect.getMetadata(ControllerMetadataKey, target);
}

/**
 * Controller decorator, indicates http adaptor to scan its method for routing request
 * @decorator
 */
export function Controller(path: string, controllerOption: ControllerOption = {}) {
  return (target: Constructor) => {
    // Decorate target as a component
    Component()(target);
    const labels = controllerOption.labels ?? controllerOption.label;
    setHttpControllerMetadata(target, {
      target,
      path,
      prototype: target.prototype,
      interceptors: controllerOption.interceptors ?? [],
      labels: labels instanceof Set ? labels : new Set(labels)
    });
  };
}
