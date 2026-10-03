export interface HomeData {
  welcomeMessage: string;
}

export class HomeService {
  public getHomeData(): HomeData {
    return {
      welcomeMessage: 'Welcome to The Vinyl Drop',
    };
  }
}

export const homeService = new HomeService();
