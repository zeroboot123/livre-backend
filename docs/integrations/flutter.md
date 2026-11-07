# Integração Flutter

## Dependências

```yaml
dependencies:
  http: ^1.2.0
```

## Cliente Básico

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class LivreClient {
  final String baseUrl;
  String? _token;

  LivreClient({required this.baseUrl});

  void setToken(String token) {
    _token = token;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  // Login
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    return jsonDecode(response.body);
  }

  // Registrar
  Future<Map<String, dynamic>> register(
      String email, String password, String name) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: _headers,
      body: jsonEncode({
        'email': email,
        'password': password,
        'name': name,
      }),
    );
    return jsonDecode(response.body);
  }

  // Consultar dados (PostgREST)
  Future<List<dynamic>> from(String table) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/rest/$table'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // Criar registro
  Future<Map<String, dynamic>> insert(
      String table, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/rest/$table'),
      headers: _headers,
      body: jsonEncode(data),
    );
    return jsonDecode(response.body);
  }
}
```

## Uso

```dart
void main() async {
  final client = LivreClient(
    baseUrl: 'https://api.livrebackend.com.br',
  );

  // Login
  final result = await client.login('usuario@email.com', 'senha123');
  client.setToken(result['access_token']);

  // Consultar dados
  final dados = await client.from('minha_tabela');
  print(dados);
}
```
