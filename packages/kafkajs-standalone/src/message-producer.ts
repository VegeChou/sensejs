import {Kafka, Offsets, Partitioners, Producer, ProducerConfig, TopicMessages} from 'kafkajs';
import {KafkaConnectOption, KafkaMessage, KafkaProducerOption, KafkaSendOption, MessageKeyProvider} from './types';
import {convertConnectOption, KafkaLogOption} from './utils';
import {uuidV1} from '@sensejs/utility';

export interface MessageProducerOption {
  connectOption: KafkaConnectOption;
  logOption?: KafkaLogOption;
  producerOption?: KafkaProducerOption;
  sendOption?: KafkaSendOption;
}

export interface BatchSendOption {
  /**
   * Whether messages be sent in one transaction
   */
  transactional?: boolean;
  /**
   * If messages be sent in one transaction, also commit offsets of topic and partitions for given consumer group
   */
  transactionalCommit?: {
    consumerGroupId: string;
    offsets: Offsets;
  };
}

function defaultKeyPolicy() {
  return null;
}

export class MessageProducer {
  private readonly client: Kafka;
  private producer?: Producer;
  private connectPromise?: Promise<void>;
  private disconnectPromise: Promise<void> = Promise.resolve();
  private allMessageSend: Promise<unknown> = Promise.resolve();
  private readonly messageKeyProvider: MessageKeyProvider;
  private readonly producerConfig: ProducerConfig;

  constructor(private option: MessageProducerOption) {
    const {
      connectOption,
      logOption,
      producerOption: {
        messageKeyProvider = defaultKeyPolicy, ...producerConfig
      } = {},
    } = option;
    this.client = new Kafka(convertConnectOption(connectOption, logOption));
    this.messageKeyProvider = messageKeyProvider;
    this.producerConfig = producerConfig;
  }

  async connect() {
    if (this.connectPromise) {
      return this.connectPromise;
    }
    const {
      transactionalId = uuidV1(),
      maxInFlightRequests = 1,
      idempotent = true,
      createPartitioner = Partitioners.JavaCompatiblePartitioner,
      ...producerOption
    } = this.producerConfig;
    this.producer = this.client.producer({
      maxInFlightRequests,
      idempotent,
      transactionalId,
      ...producerOption,
    });
    this.connectPromise = this.producer.connect();
    return this.connectPromise;
  }

  /**
   * Send message(s) to one topic
   *
   * @param topic
   * @param messages
   */
  async send(topic: string, messages: KafkaMessage[] | KafkaMessage) {
    if (!this.producer) {
      throw new Error('producer is not connected');
    }
    const promise = this.producer.send({
      ...this.option.sendOption,
      topic,
      messages: this.provideKeyForMessage(topic, Array.isArray(messages) ? messages : [messages]),
    });

    this.allMessageSend = this.allMessageSend.then(() => promise.catch(() => void 0));
    return promise;
  }

  /**
   * Send batched messages. And ensure messages to be sent in one transaction if required
   *
   * @param topicMessages
   * @param option
   *
   * @beta
   */
  async sendBatch(topicMessages: TopicMessages[], option: BatchSendOption = {}) {
    if (!this.producer) {
      throw new Error('producer is not connected');
    }
    const promise = this.performSendBatch(this.producer, topicMessages.map((topicMessage) => {
      const {topic, messages} = topicMessage;
      return {topic, messages: this.provideKeyForMessage(topic, messages)};
    }), option);
    this.allMessageSend = this.allMessageSend.then(() => promise.catch(() => void 0));
    return promise;
  }

  async disconnect() {
    const producer = this.producer;
    if (!producer) {
      return this.disconnectPromise;
    }
    delete this.producer;

    this.disconnectPromise = this.allMessageSend.then(() => {
      return producer.disconnect();
    });
    return this.disconnectPromise;
  }

  private provideKeyForMessage(topic: string, messages: KafkaMessage[]): KafkaMessage[] {
    return messages.map((message): KafkaMessage => {
      const {key, value, ...rest} = message;
      return {key: key ?? this.messageKeyProvider(value, topic), value, ...rest};
    });
  }

  private async performSendBatch(producer: Producer, topicMessages: TopicMessages[], option: BatchSendOption) {
    if (!option.transactional) {
      return producer.sendBatch({...this.option.sendOption, topicMessages});
    }
    const sender = await producer.transaction();
    try {
      await sender.sendBatch({...this.option.sendOption, topicMessages});
      if (option.transactionalCommit) {
        await sender.sendOffsets({
          consumerGroupId: option.transactionalCommit.consumerGroupId,
          ...option.transactionalCommit.offsets,
        });
      }
      await sender.commit();
    } catch (e) {
      await sender.abort();
      throw e;
    }
  }
}
