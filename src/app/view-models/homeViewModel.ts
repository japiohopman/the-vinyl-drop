export interface HomeViewModel {
  [key: string]: unknown;
  title: string;
  message: string;
}

export function buildHomeViewModel(welcomeMessage: string): HomeViewModel {
  return {
    title: 'Home',
    message: welcomeMessage,
  };
}
