import {
  Abstract,
  composeRequestInterceptor,
  invokeMethod,
  Module,
  ModuleConstructor,
  ModuleOption,
  RequestInterceptor,
} from '@sensejs/core';
import {Container, inject} from 'inversify';
import {Message} from 'kafka-node';
import {ConsumerGroup} from './consumer-group';
import {SubscribeContext} from './subscribe-context';
import {getSubscribeControllerMetadata, getSubscribeTopicMetadata} from './subscribe-decorators';
import {ConnectOption, ConsumeOption, FetchOption, TopicSubscriberOption} from './topic-subscriber';

export interface KafkaSubscribeModuleOption extends ModuleOption {
  kafkaConnectOption: ConnectOption;
  defaultFetchOption?: FetchOption;
  defaultConsumeOption?: ConsumeOption;
  globalInterceptors?: Abstract<RequestInterceptor>[];
}

export function KafkaSubscribeModule(option: KafkaSubscribeModuleOption): ModuleConstructor {
  class KafkaSubscriberModule extends Module(option) {
    private consumerGroup?: ConsumerGroup;

    constructor(@inject(Container) private container: Container) {
      super();
    }

    async onCreate(): Promise<void> {
      super.onCreate();
      const map = this.scanController();

      if (map.size < 0) {
        return;
      }

      this.consumerGroup = new ConsumerGroup(option.kafkaConnectOption);

      for (const option of map.values()) {
        this.consumerGroup.subscribe(option.topic, option.messageConsumer, option.consumeOption, option.fetchOption);
      }

      await this.consumerGroup.open();
    }

    async onDestroy(): Promise<void> {
      if (this.consumerGroup) {
        const consumerGroup = this.consumerGroup;
        delete this.consumerGroup;
        await consumerGroup.close();
      }
      return super.onDestroy();
    }

    private scanController() {
      const map = new Map<string, TopicSubscriberOption>();
      for (const component of option.components || []) {
        const controllerMetadata = getSubscribeControllerMetadata(component);
        if (!controllerMetadata) {
          continue;
        }
        for (const propertyDescriptor of Object.values(Object.getOwnPropertyDescriptors(component.prototype))) {
          const subscribeMetadata = getSubscribeTopicMetadata(propertyDescriptor.value);

          if (!subscribeMetadata) {
            continue;
          }
          const topic = subscribeMetadata.topic;

          if (map.get(topic)) {
            throw new Error('Duplicated topic subscription');
          }

          const composedInterceptor = composeRequestInterceptor(this.container, [
            ...(option.globalInterceptors || []),
            ...controllerMetadata.interceptors,
            ...subscribeMetadata.interceptors,
          ]);

          map.set(topic, {
            connectOption: option.kafkaConnectOption,
            fetchOption: option.defaultFetchOption,
            consumeOption: option.defaultConsumeOption,
            topic,
            messageConsumer: async (message: Message) => {
              const container = this.container.createChild();
              const context = new SubscribeContext(container, message);
              container.bind(SubscribeContext).toConstantValue(context);
              const interceptor = container.get(composedInterceptor);
              await interceptor.intercept(context, async () => {
                const target = container.get<object>(controllerMetadata.target);
                await invokeMethod(container, target, propertyDescriptor.value);
              });
            },
          });
        }
      }
      return map;
    }
  }

  return KafkaSubscriberModule;
}
