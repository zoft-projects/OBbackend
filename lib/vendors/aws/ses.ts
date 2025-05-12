import { SESClient, SendRawEmailCommand, SendEmailCommandOutput } from '@aws-sdk/client-ses';
import config from 'config';
import MailComposer from 'mailcomposer';
import { logError, logInfo } from '../../log/util';

const sesConfig: { region: string } = config.get('Services.ses');

const sesClient = new SESClient({ region: sesConfig.region });

type Attachment = {
  filename: string;
  content: Buffer;
};

type SendEmailParams = {
  fromEmail: string;
  toEmail: string[];
  subject: string;
  message: string;
  attachments?: Attachment[];
};

const sendEmailUsingSES = async (txId: string, params: SendEmailParams): Promise<SendEmailCommandOutput> => {
  try {
    logInfo(`[${txId}] [ONEBAYSHORE-SES-SERVICE] sendEmailUsingSES method triggered.`);

    const mailOptions = {
      from: params.fromEmail,
      to: params.toEmail,
      subject: params.subject,
      text: params.message,
      ...(params.attachments && {
        attachments: params.attachments,
      }),
    };

    const mail = new MailComposer(mailOptions);

    const compiledMail = await new Promise<Buffer>((resolve, reject) => {
      mail.build((error: any, result: Buffer) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });

    const sesRawParams = {
      RawMessage: { Data: compiledMail },
    };

    const command = new SendRawEmailCommand(sesRawParams);
    const response: SendEmailCommandOutput = await sesClient.send(command);

    logInfo(
      `[${txId}] [ONEBAYSHORE-SES-SERVICE] Email sent successfully. SES response metadata: ${JSON.stringify(
        response.$metadata,
      )}, MessageId: ${response.MessageId}`,
    );

    return response;
  } catch (err) {
    logError(`[${txId}] [ONEBAYSHORE-SES-SERVICE] Error occurred while sending email via SES, error: ${err.message}`);
    throw err;
  }
};

export { sendEmailUsingSES };
