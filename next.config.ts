import type {NextConfig} from 'next';

const config: NextConfig = {
  experimental: {
    // 20 MB of attachments plus multipart headers and message fields.
    proxyClientMaxBodySize: '22mb',
  },
};

export default config;
