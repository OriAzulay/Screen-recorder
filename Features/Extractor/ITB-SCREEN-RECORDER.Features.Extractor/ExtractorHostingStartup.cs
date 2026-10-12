// ==========================================
// File: Features/Extractor/ExtractorHostingStartup.cs
// ==========================================
using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ITB_SCREEN_RECORDER.Core.Abstractions;
using ITB_SCREEN_RECORDER.Core.Plugins;
using ITB_SCREEN_RECORDER.Features.Extractor.Data;
using ITB_SCREEN_RECORDER.Features.Extractor.Data.Repositories;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;
using ITB_SCREEN_RECORDER.Features.Extractor.Services;

[assembly: HostingStartup(typeof(ITB_SCREEN_RECORDER.Features.Extractor.ExtractorHostingStartup))]

namespace ITB_SCREEN_RECORDER.Features.Extractor
{
    public class ExtractorHostingStartup : IHostingStartup
    {
        public void Configure(IWebHostBuilder builder)
        {
            builder.ConfigureServices((context, services) =>
            {
                services.Configure<ExtractorOptions>(context.Configuration.GetSection(ExtractorOptions.SectionName));

                // 1. תשתית מסד הנתונים SQLite של הפיצ'ר
                services.AddSingleton<IExtractorConnectionFactory, ExtractorConnectionFactory>();
                services.AddSingleton<IFeatureDbInitializer, ExtractorDbInitializer>();
                services.AddSingleton<IExportJobRepository, ExportJobRepository>();

                // 2. איתור בינאריים תשתיתי (FFmpeg / FFprobe)
                services.AddSingleton<IFfmpegBinaryResolver, FfmpegBinaryResolver>();

                // 3. שירותי סנכרון, מטא-דאטה ורינדור Core
                services.AddSingleton<IStorageScannerService, StorageScannerService>();
                services.AddSingleton<IFfmpegConcatRunner, FfmpegConcatRunner>();
                services.AddSingleton<IMediaProbeService, MediaProbeService>();
                services.AddSingleton<IVideoMetadataService, VideoMetadataService>();
                services.AddSingleton<INoSignalPatternService, NoSignalPatternService>();
                services.AddSingleton<ISynchronizationPlanBuilder, SynchronizationPlanBuilder>();
                services.AddSingleton<ISynchronizedTrackCutter, SynchronizedTrackCutter>();

                // 4. מנוע ה-Extractor הראשי
                services.AddSingleton<ExtractorService>();
                services.AddSingleton<IExtractorService>(sp => sp.GetRequiredService<ExtractorService>());

                // 5. ניהול ג'ובים, תחזוקת רקע ומודול
                services.AddSingleton<IDummyVideoGenerator, DummyVideoGenerator>();
                services.AddSingleton<ExportJobManager>();
                services.AddSingleton<IExportJobManager>(sp => sp.GetRequiredService<ExportJobManager>());
                services.AddHostedService<ExtractorGarbageCollectorService>();
                services.AddSingleton<IFeatureModule, ExtractorModule>();

                services.AddControllers()
                    .AddApplicationPart(typeof(ExtractorHostingStartup).Assembly);

                // 6. אתחול אוטונומי וניתוב UI סטטי
                services.AddTransient<IStartupFilter, ExtractorStartupFilter>();
            });
        }
    }

    public class ExtractorStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                using (var scope = app.ApplicationServices.CreateScope())
                {
                    try
                    {
                        var initializer = scope.ServiceProvider.GetRequiredService<IFeatureDbInitializer>();
                        initializer.Initialize();
                    }
                    catch (Exception ex)
                    {
                        var logger = scope.ServiceProvider.GetService<ILogger<ExtractorStartupFilter>>();
                        logger?.LogError(ex, "[EXTRACTOR] Failed to auto-initialize extractor.db");
                    }
                }

                app.UseFeatureStaticAssets(typeof(ExtractorStartupFilter).Assembly, "/extractor");

                next(app);
            };
        }
    }
}