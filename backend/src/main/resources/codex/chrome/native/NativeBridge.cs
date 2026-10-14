using System;
using System.IO;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Chrome Native Messaging 的 stdout 只允许小端长度帧，诊断只写 stderr。
internal static class NativeBridge {
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 6000000 };
    private static int Main(string[] args) {
        try {
            string configurationPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bridge-config.json");
            var configuration = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(configurationPath, Encoding.UTF8));
            Uri baseUri = new Uri((string)configuration["baseUrl"]);
            if (!(baseUri.Host == "127.0.0.1" || baseUri.Host == "localhost") || baseUri.Scheme != "http") throw new InvalidOperationException("Local backend required");
            string secret = (string)configuration["bridgeSecret"];
            Stream input = Console.OpenStandardInput(); Stream output = Console.OpenStandardOutput();
            while (true) {
                byte[] size = Read(input, 4); if (size == null) return 0;
                int length = BitConverter.ToInt32(size, 0); if (length < 1 || length > 6000000) return 2;
                byte[] bytes = Read(input, length); if (bytes == null) return 0;
                object result;
                try {
                    var request = (HttpWebRequest)WebRequest.Create(new Uri(baseUri, "/api/v1/codex/chrome/bridge/exchange"));
                    request.Method = "POST"; request.ContentType = "application/json"; request.Timeout = 5000; request.ReadWriteTimeout = 5000;
                    request.Proxy = null; request.AllowAutoRedirect = false; request.Headers["X-Codex-Chrome-Bridge"] = secret;
                    request.ContentLength = bytes.Length; using (var body = request.GetRequestStream()) body.Write(bytes, 0, bytes.Length);
                    using (var response = request.GetResponse()) using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) result = Json.DeserializeObject(reader.ReadToEnd());
                } catch (Exception) { result = new Dictionary<string, object> { { "error", "本机工作台未连接或 Native Host 凭证失效，请运行检查脚本" } }; }
                byte[] encoded = Encoding.UTF8.GetBytes(Json.Serialize(result));
                if (encoded.Length > 1000000) encoded = Encoding.UTF8.GetBytes("{\"error\":\"桥响应过大\"}");
                byte[] header = BitConverter.GetBytes(encoded.Length); output.Write(header, 0, 4); output.Write(encoded, 0, encoded.Length); output.Flush();
            }
        } catch (Exception) { Console.Error.WriteLine("Codex Native Host configuration unavailable"); return 1; }
    }
    private static byte[] Read(Stream stream, int length) {
        byte[] result = new byte[length]; int offset = 0;
        while (offset < length) { int count = stream.Read(result, offset, length - offset); if (count == 0) return null; offset += count; }
        return result;
    }
}
