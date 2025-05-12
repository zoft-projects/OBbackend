import config from 'config';
import { logError, logInfo } from '../../log/util';
import { sendEmailUsingSES } from '../../vendors';

const fromEmail: string = config.get('Services.ses.fromEmail');
type Attachment = {
  filename: string;
  content: Buffer;
};

const sendEmail = async (
  txId: string,
  emailDetails: { recipientEmails: string[]; emailSubject: string; emailBody: string; attachments?: Attachment[] },
): Promise<string> => {
  try {
    const { recipientEmails, emailSubject, emailBody, attachments = [] } = emailDetails;
    logInfo(`[${txId}] [SERVICE] sendEmail Started for ${recipientEmails} sending email`);

    const emailParams = {
      fromEmail,
      toEmail: recipientEmails,
      subject: emailSubject,
      message: emailBody,
      ...(attachments.length > 0 && { attachments }),
    };

    const result = await sendEmailUsingSES(txId, emailParams);

    logInfo(`[${txId}] [SERVICE] sendEmail Email sent successfully: ${JSON.stringify(result)}`);

    return result.MessageId;
  } catch (err) {
    logError(`[${txId}] [SERVICE] sendEmail - ERROR sending email, reason: ${err.message}`);
    throw err;
  }
};

export { sendEmail };
