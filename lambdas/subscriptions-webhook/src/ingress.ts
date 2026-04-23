import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

// TODO: implement stripe-ingress-lambda (PROMPT-2.x)
export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  return { statusCode: 501, body: JSON.stringify({ message: 'Not implemented' }) }
}
