Rails.application.routes.draw do
  get "/" => "home#top"
  get "about" => "home#about"
  resources :users
  get "login" => "login_form"
  resources :posts
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
end
