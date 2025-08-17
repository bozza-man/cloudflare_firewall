/* eslint-env jest */
export default {
  prompt: jest.fn().mockResolvedValue({
    confirm: true,
    name: 'Test Rule',
    action: 'block'
  })
};
